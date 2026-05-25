'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, requestTypeLabel } from '@/lib/utils/format'
import type { AbsenceRequest } from '@/lib/supabase/types'

export default function AbsencesTab() {
  const supabase = createClient()
  const [requests, setRequests] = useState<AbsenceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

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

  const filtered = filter
    ? requests.filter(r => r.request_type === filter)
    : requests

  const typeColors: Record<string, string> = {
    vacation: 'badge--info',
    absence: 'badge--warning',
    replacement: 'badge--success',
    other: 'badge--muted',
  }

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">היעדרויות ובקשות</div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '5px 10px', fontSize: '.85rem' }}>
          <option value="">הכל</option>
          <option value="vacation">חופשה</option>
          <option value="absence">היעדרות</option>
          <option value="replacement">החלפה</option>
          <option value="other">אחר</option>
        </select>
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> :
        filtered.length === 0 ? <div className="emptyState">אין בקשות.</div> :
        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>תאריך בקשה</th><th>משגיח</th><th>סוג</th><th>מתאריך</th><th>עד תאריך</th><th>מקום</th><th>ממלא מקום</th><th>הערות</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="noWrap">{formatDate(r.created_at)}</td>
                  <td>{(r.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                  <td><span className={`badge ${typeColors[r.request_type] ?? 'badge--muted'}`}>
                    {requestTypeLabel(r.request_type)}
                  </span></td>
                  <td>{r.start_date ? formatDate(r.start_date) : <span className="mutedCell">-</span>}</td>
                  <td>{r.end_date ? formatDate(r.end_date) : <span className="mutedCell">-</span>}</td>
                  <td>{(r.location as { name: string } | undefined)?.name ?? <span className="mutedCell">-</span>}</td>
                  <td>{(r.replacement_inspector as { full_name: string } | undefined)?.full_name ?? <span className="mutedCell">-</span>}</td>
                  <td style={{ maxWidth: 200, fontSize: '.82rem' }}>{r.notes ?? <span className="mutedCell">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  )
}
