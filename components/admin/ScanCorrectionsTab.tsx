'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/utils/format'
import type { ScanCorrection, ScanCorrectionStatus, ScanCorrectionType } from '@/lib/supabase/types'

type Props = { refreshKey: number }

const STATUS: Record<ScanCorrectionStatus, { label: string; cls: string }> = {
  pending:  { label: 'ממתין',  cls: 'badge--warning' },
  approved: { label: 'אושר',   cls: 'badge--success' },
  denied:   { label: 'נדחה',   cls: 'badge--danger' },
}

const TYPE_LABEL: Record<ScanCorrectionType, string> = {
  missed_checkout: 'שכחת יציאה',
  missing_visit:   'ביקור חסר',
}

export default function ScanCorrectionsTab({ refreshKey }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [rows, setRows] = useState<ScanCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | ScanCorrectionStatus>('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  useEffect(() => { loadAll() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('scan_corrections')
      .select('*, inspector:profiles!scan_corrections_inspector_id_fkey(id,full_name), location:locations(id,name,city)')
      .order('created_at', { ascending: false })
    setRows((data ?? []) as ScanCorrection[])
    setLoading(false)
  }

  async function review(row: ScanCorrection, status: 'approved' | 'denied') {
    setProcessingId(row.id)
    const res = await fetch('/api/admin/scan-correction', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, status, admin_notes: notes[row.id] ?? null }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) toast(json.error ?? 'שגיאה בעדכון', 'error')
    else { toast(status === 'approved' ? 'הבקשה אושרה והביקור נוצר' : 'הבקשה נדחתה', 'success'); loadAll() }
    setProcessingId(null)
  }

  const filtered = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter)

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">תיקוני סריקה</div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ fontSize: '.82rem', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <option value="pending">ממתינות</option>
          <option value="approved">אושרו</option>
          <option value="denied">נדחו</option>
          <option value="all">הכל</option>
        </select>
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> :
        filtered.length === 0 ? <div className="emptyState">אין בקשות.</div> :
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>נשלח</th><th>סוג</th><th>משגיח</th><th>מקום</th><th>כניסה משוערת</th><th>יציאה משוערת</th>
                <th>הערה</th><th>סטטוס</th><th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const insp = (r.inspector as { full_name?: string } | undefined)?.full_name ?? '-'
                const loc = (r.location as { name?: string } | undefined)?.name ?? '-'
                const st = STATUS[r.status]
                return (
                  <tr key={r.id}>
                    <td className="noWrap textSm textMuted">{formatDateTime(r.created_at)}</td>
                    <td className="noWrap"><span className="badge badge--muted">{TYPE_LABEL[r.correction_type] ?? '-'}</span></td>
                    <td>{insp}</td>
                    <td>{loc}</td>
                    <td className="noWrap">{r.est_entry ? formatDateTime(r.est_entry) : <span className="mutedCell">-</span>}</td>
                    <td className="noWrap">{formatDateTime(r.est_exit)}</td>
                    <td>{r.note ?? <span className="mutedCell">-</span>}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td>
                      {r.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input placeholder="הערת מנהל" value={notes[r.id] ?? ''}
                            onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                            style={{ fontSize: '.8rem', padding: '5px 7px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: 110 }} />
                          <button className="button button--icon button--ghost" title="אשר" style={{ color: 'var(--success)' }}
                            disabled={processingId === r.id} onClick={() => review(r, 'approved')}><Check size={15} /></button>
                          <button className="button button--icon button--ghost" title="דחה" style={{ color: 'var(--danger)' }}
                            disabled={processingId === r.id} onClick={() => review(r, 'denied')}><X size={15} /></button>
                        </div>
                      ) : (
                        <span className="textSm textMuted">{r.admin_notes ?? '-'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  )
}
