'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatDate, requestTypeLabel } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/excel'
import type { AbsenceRequest, AbsenceAdminStatus } from '@/lib/supabase/types'

const STATUS_LABELS: Record<AbsenceAdminStatus, string> = {
  pending:  'ממתין',
  approved: 'אושר',
  denied:   'נדחה',
}

const STATUS_COLORS: Record<AbsenceAdminStatus, string> = {
  pending:  'badge--warning',
  approved: 'badge--success',
  denied:   'badge--danger',
}

const TYPE_COLORS: Record<string, string> = {
  vacation:    'badge--info',
  absence:     'badge--warning',
  replacement: 'badge--success',
  other:       'badge--muted',
}

export default function AbsencesTab() {
  const supabase = createClient()
  const { toast } = useToast()
  const [requests, setRequests] = useState<AbsenceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase
      .from('absence_requests')
      .select('*, inspector:profiles(id,full_name), location:locations(id,name), replacement_inspector:profiles!absence_requests_replacement_inspector_id_fkey(id,full_name)')
      .order('created_at', { ascending: false })
    setRequests((data ?? []) as AbsenceRequest[])
    setLoading(false)
  }

  async function updateStatus(id: string, admin_status: AbsenceAdminStatus) {
    const { error } = await supabase.from('absence_requests').update({ admin_status }).eq('id', id)
    if (error) { toast('שגיאה בעדכון סטטוס', 'error'); return }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, admin_status } : r))
  }

  async function saveNotes(id: string) {
    const notes = editingNotes[id] ?? ''
    const { error } = await supabase.from('absence_requests').update({ admin_notes: notes || null }).eq('id', id)
    if (error) { toast('שגיאה בשמירת הערה', 'error'); return }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, admin_notes: notes || null } : r))
    toast('הערה נשמרה', 'success')
  }

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('absence_requests').delete().eq('id', deleteId)
    if (error) { toast('שגיאה במחיקה', 'error') }
    else { toast('הבקשה נמחקה', 'success'); setRequests(prev => prev.filter(r => r.id !== deleteId)) }
    setDeleteId(null)
  }

  const filtered = requests.filter(r => {
    if (typeFilter && r.request_type !== typeFilter) return false
    if (statusFilter && r.admin_status !== statusFilter) return false
    return true
  })

  function handleExport() {
    const rows = filtered.map(r => ({
      'תאריך בקשה':   formatDate(r.created_at),
      'משגיח':        (r.inspector as { full_name: string } | undefined)?.full_name ?? '-',
      'סוג':          requestTypeLabel(r.request_type),
      'מתאריך':       r.start_date ? formatDate(r.start_date) : '-',
      'עד תאריך':     r.end_date ? formatDate(r.end_date) : '-',
      'מקום':         (r.location as { name: string } | undefined)?.name ?? '-',
      'ממלא מקום':    (r.replacement_inspector as { full_name: string } | undefined)?.full_name ?? '-',
      'הערות':        r.notes ?? '-',
      'סטטוס מנהל':   STATUS_LABELS[r.admin_status],
      'הערות מנהל':   r.admin_notes ?? '-',
    }))
    exportToExcel(rows, `היעדרויות_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}`, 'היעדרויות')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters */}
      <div className="card">
        <div className="card__header"><div className="card__title">סינון</div></div>
        <div className="card__body">
          <div className="filtersGrid">
            <label className="field"><span>סוג בקשה</span>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">הכל</option>
                <option value="vacation">חופשה</option>
                <option value="absence">היעדרות</option>
                <option value="replacement">החלפה</option>
                <option value="other">אחר</option>
              </select>
            </label>
            <label className="field"><span>סטטוס</span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">הכל</option>
                <option value="pending">ממתין</option>
                <option value="approved">אושר</option>
                <option value="denied">נדחה</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">היעדרויות ובקשות ({filtered.length})</div>
          <button className="button button--ghost button--sm" onClick={handleExport}>
            <Download size={14} /> ייצא Excel
          </button>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          filtered.length === 0 ? <div className="emptyState">אין בקשות.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>תאריך</th><th>משגיח</th><th>סוג</th><th>מתאריך</th><th>עד תאריך</th>
                  <th>מקום</th><th>ממלא מקום</th><th>הערות</th><th>סטטוס</th><th>הערות מנהל</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="noWrap">{formatDate(r.created_at)}</td>
                    <td>{(r.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                    <td>
                      <span className={`badge ${TYPE_COLORS[r.request_type] ?? 'badge--muted'}`}>
                        {requestTypeLabel(r.request_type)}
                      </span>
                    </td>
                    <td>{r.start_date ? formatDate(r.start_date) : <span className="mutedCell">-</span>}</td>
                    <td>{r.end_date ? formatDate(r.end_date) : <span className="mutedCell">-</span>}</td>
                    <td>{(r.location as { name: string } | undefined)?.name ?? <span className="mutedCell">-</span>}</td>
                    <td>{(r.replacement_inspector as { full_name: string } | undefined)?.full_name ?? <span className="mutedCell">-</span>}</td>
                    <td style={{ maxWidth: 160, fontSize: '.82rem' }}>{r.notes ?? <span className="mutedCell">-</span>}</td>
                    <td>
                      <select
                        value={r.admin_status}
                        onChange={e => updateStatus(r.id, e.target.value as AbsenceAdminStatus)}
                        className={`badge ${STATUS_COLORS[r.admin_status]}`}
                        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 6px', fontSize: '.8rem', cursor: 'pointer' }}>
                        <option value="pending">ממתין</option>
                        <option value="approved">אושר</option>
                        <option value="denied">נדחה</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          value={editingNotes[r.id] ?? (r.admin_notes ?? '')}
                          onChange={e => setEditingNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="הוסף הערה..."
                          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 8px', fontSize: '.82rem', width: 130 }}
                        />
                        {editingNotes[r.id] !== undefined && editingNotes[r.id] !== (r.admin_notes ?? '') && (
                          <button className="button button--primary button--sm" onClick={() => saveNotes(r.id)}
                            style={{ padding: '3px 8px', fontSize: '.75rem' }}>שמור</button>
                        )}
                      </div>
                    </td>
                    <td>
                      <button className="button button--icon button--ghost" title="מחיקה"
                        style={{ color: 'var(--danger)' }} onClick={() => setDeleteId(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      </div>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת בקשה"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteId(null)}>ביטול</button>
          <button className="button button--danger" onClick={handleDelete}>מחק</button>
        </>}>
        <p>האם אתה בטוח שברצונך למחוק בקשה זו? הפעולה אינה הפיכה.</p>
      </Modal>
    </div>
  )
}
