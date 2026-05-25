'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download } from 'lucide-react'
import { formatDateTime, adminStatusLabel, reportTypeLabel } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/excel'
import type { DeficiencyReport } from '@/lib/supabase/types'

export default function DeficienciesTab() {
  const supabase = createClient()
  const [reports, setReports] = useState<DeficiencyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', type: '', inspector: '', location: '' })
  const [inspectorList, setInspectorList] = useState<{ id: string; full_name: string }[]>([])
  const [locationList, setLocationList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: rpts }, { data: insp }, { data: locs }] = await Promise.all([
      supabase.from('deficiency_reports')
        .select('*, inspector:profiles(id,full_name), location:locations(id,name,city)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name').eq('role', 'mashgiach').order('full_name'),
      supabase.from('locations').select('id,name').order('name'),
    ])
    setReports((rpts ?? []) as DeficiencyReport[])
    setInspectorList(insp ?? [])
    setLocationList(locs ?? [])
    setLoading(false)
  }

  async function updateStatus(id: string, field: 'admin_status' | 'admin_notes', value: string) {
    const updatePayload = field === 'admin_status'
      ? { admin_status: value as 'open' | 'in_progress' | 'resolved' }
      : { admin_notes: value }
    await supabase.from('deficiency_reports').update(updatePayload).eq('id', id)
    setReports(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const filtered = reports.filter(r => {
    if (filters.status && r.admin_status !== filters.status) return false
    if (filters.type && r.report_type !== filters.type) return false
    if (filters.inspector && r.inspector_id !== filters.inspector) return false
    if (filters.location && r.location_id !== filters.location) return false
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
                {inspectorList.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select>
            </label>
            <label className="field"><span>מקום</span>
              <select value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}>
                <option value="">הכל</option>
                {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
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
                <tr><th>תאריך</th><th>משגיח</th><th>מקום</th><th>סוג</th><th>פירוט</th><th>סטטוס</th><th>הערות</th></tr>
              </thead>
              <tbody>
                {filtered.map(r => (
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
                        onChange={e => updateStatus(r.id, 'admin_status', e.target.value)}
                        className={`badge ${statusColors[r.admin_status] ?? ''}`}
                        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 6px', fontSize: '.8rem', cursor: 'pointer' }}>
                        <option value="open">פתוח</option>
                        <option value="in_progress">בטיפול</option>
                        <option value="resolved">טופל</option>
                      </select>
                    </td>
                    <td>
                      <input
                        defaultValue={r.admin_notes ?? ''}
                        placeholder="הוסף הערה..."
                        onBlur={e => { if (e.target.value !== (r.admin_notes ?? '')) updateStatus(r.id, 'admin_notes', e.target.value) }}
                        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 8px', fontSize: '.82rem', width: 140 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      </div>
    </div>
  )
}
