'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download } from 'lucide-react'
import { formatDateTime, adminStatusLabel, reportTypeLabel } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/excel'
import type { DeficiencyReport } from '@/lib/supabase/types'
import type { SharedInspector, SharedLocation } from './AdminShell'

function thirtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FROM = thirtyDaysAgo()

type Props = {
  refreshKey: number
  inspectors: SharedInspector[]
  locations: SharedLocation[]
}

export default function DeficienciesTab({ refreshKey, inspectors, locations }: Props) {
  const supabase = createClient()
  const [reports, setReports] = useState<DeficiencyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', type: '', inspector: '', location: '', from: DEFAULT_FROM, to: '' })
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({})

  useEffect(() => { loadAll(filters.from) }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll(fromDate = filters.from) {
    setLoading(true)
    const q = supabase.from('deficiency_reports')
      .select('*, inspector:profiles(id,full_name), location:locations(id,name,city)')
      .order('created_at', { ascending: false })
    if (fromDate) q.gte('created_at', fromDate)
    const { data: rpts } = await q
    setReports((rpts ?? []) as DeficiencyReport[])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('deficiency_reports').update({ admin_status: status as 'open' | 'in_progress' | 'resolved' }).eq('id', id)
    setReports(prev => prev.map(r => r.id === id ? { ...r, admin_status: status as DeficiencyReport['admin_status'] } : r))
  }

  async function saveNotes(id: string) {
    const value = editingNotes[id] ?? ''
    setSavingNotes(prev => ({ ...prev, [id]: true }))
    await supabase.from('deficiency_reports').update({ admin_notes: value }).eq('id', id)
    setReports(prev => prev.map(r => r.id === id ? { ...r, admin_notes: value } : r))
    setEditingNotes(prev => { const n = { ...prev }; delete n[id]; return n })
    setSavingNotes(prev => ({ ...prev, [id]: false }))
  }

  const filtered = reports.filter(r => {
    if (filters.status && r.admin_status !== filters.status) return false
    if (filters.type && r.report_type !== filters.type) return false
    if (filters.inspector && r.inspector_id !== filters.inspector) return false
    if (filters.location && r.location_id !== filters.location) return false
    if (filters.to && r.created_at > filters.to + 'T23:59:59') return false
    return true
  })

  function handleExport() {
    const rows = filtered.map(r => ({
      'תאריך': formatDateTime(r.created_at),
      'משגיח': (r.inspector as { full_name: string } | undefined)?.full_name ?? '-',
      'מקום': (r.location as { name: string } | undefined)?.name ?? '-',
      'סוג': reportTypeLabel(r.report_type),
      'פירוט': r.description,
      'סטטוס': adminStatusLabel(r.admin_status),
      'הערות מנהל': r.admin_notes ?? '',
    }))
    exportToExcel(rows, `ליקויים_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}`, 'ליקויים')
  }

  const statusColors: Record<string, string> = {
    open: 'badge--danger',
    in_progress: 'badge--warning',
    resolved: 'badge--success',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters */}
      <div className="card">
        <div className="card__header"><div className="card__title">סינון</div></div>
        <div className="card__body">
          <div className="filtersGrid">
            <label className="field"><span>מתאריך</span>
              <input type="date" value={filters.from}
                onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            </label>
            <label className="field"><span>עד תאריך</span>
              <input type="date" value={filters.to}
                onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            </label>
            <label className="field"><span>סטטוס</span>
              <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                <option value="">הכל</option>
                <option value="open">פתוח</option>
                <option value="in_progress">בטיפול</option>
                <option value="resolved">טופל</option>
              </select>
            </label>
            <label className="field"><span>סוג</span>
              <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                <option value="">הכל</option>
                <option value="deficiency">ליקוי</option>
                <option value="note">הערה</option>
              </select>
            </label>
            <label className="field"><span>משגיח</span>
              <select value={filters.inspector} onChange={e => setFilters(f => ({ ...f, inspector: e.target.value }))}>
                <option value="">הכל</option>
                {inspectors.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select>
            </label>
            <label className="field"><span>מקום</span>
              <select value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}>
                <option value="">הכל</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="button button--primary button--sm" onClick={() => loadAll(filters.from)}>טען</button>
            <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>מוצגים נתוני 30 הימים האחרונים. לצפייה בנתונים ישנים יותר, שנה את תאריך ההתחלה ולחץ טען.</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">ליקויי כשרות ({filtered.length})</div>
          <button className="button button--ghost button--sm" onClick={handleExport}>
            <Download size={14} /> ייצא Excel
          </button>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          filtered.length === 0 ? <div className="emptyState">אין ליקויים.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>תאריך</th><th>משגיח</th><th>מקום</th><th>סוג</th><th>פירוט</th><th>סטטוס</th><th>הערות מנהל</th></tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const noteValue = r.id in editingNotes ? editingNotes[r.id] : (r.admin_notes ?? '')
                  const isDirty = r.id in editingNotes && editingNotes[r.id] !== (r.admin_notes ?? '')
                  return (
                    <tr key={r.id}>
                      <td className="noWrap">{formatDateTime(r.created_at)}</td>
                      <td>{(r.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                      <td>{(r.location as { name: string } | undefined)?.name ?? '-'}</td>
                      <td><span className={`badge ${r.report_type === 'deficiency' ? 'badge--danger' : 'badge--info'}`}>
                        {reportTypeLabel(r.report_type)}
                      </span></td>
                      <td style={{ maxWidth: 220 }}>{r.description}</td>
                      <td>
                        <select
                          value={r.admin_status}
                          onChange={e => updateStatus(r.id, e.target.value)}
                          className={`badge ${statusColors[r.admin_status] ?? ''}`}
                          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 6px', fontSize: '.8rem', cursor: 'pointer' }}>
                          <option value="open">פתוח</option>
                          <option value="in_progress">בטיפול</option>
                          <option value="resolved">טופל</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            value={noteValue}
                            placeholder="הוסף הערה..."
                            onChange={e => setEditingNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 8px', fontSize: '.82rem', width: 140 }}
                          />
                          {isDirty && (
                            <button
                              className="button button--primary button--sm"
                              onClick={() => saveNotes(r.id)}
                              disabled={savingNotes[r.id]}>
                              {savingNotes[r.id] ? <span className="spinner" style={{ width: 10, height: 10 }} /> : 'שמור'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>}
        </div>
      </div>
    </div>
  )
}
