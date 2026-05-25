'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, statusLabel, actionLabel } from '@/lib/utils/format'
import type { VisitLog } from '@/lib/supabase/types'

export default function SystemLogsTab() {
  const supabase = createClient()
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('visit_logs')
      .select('*, inspector:profiles(id,full_name), location:locations(id,name,city)')
      .order('created_at', { ascending: false })
      .limit(500)
    setLogs((data ?? []) as VisitLog[])
    setLoading(false)
  }

  const filtered = search
    ? logs.filter(l => {
        const insp = (l.inspector as { full_name: string } | undefined)?.full_name ?? ''
        const loc = (l.location as { name: string } | undefined)?.name ?? ''
        return insp.includes(search) || loc.includes(search) || l.action_type.includes(search) || l.internal_status.includes(search)
      })
    : logs

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">לוג ביקורים ({filtered.length})</div>
        <input
          placeholder="חיפוש..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '5px 10px', fontSize: '.85rem', width: 180 }}
        />
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> :
        filtered.length === 0 ? <div className="emptyState">אין לוגים.</div> :
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>זמן</th><th>פעולה</th><th>משגיח</th><th>מקום</th>
                <th>עיר</th><th>סטטוס</th><th>מרחק</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const { label, cls } = statusLabel(log.internal_status)
                const insp = log.inspector as { full_name: string } | undefined
                const loc = log.location as { name: string; city: string | null } | undefined
                return (
                  <tr key={log.id}>
                    <td className="noWrap">{formatDateTime(log.created_at)}</td>
                    <td>{actionLabel(log.action_type)}</td>
                    <td>{insp?.full_name ?? <span className="mutedCell">-</span>}</td>
                    <td>{loc?.name ?? <span className="mutedCell">לא זוהה</span>}</td>
                    <td>{loc?.city ?? <span className="mutedCell">-</span>}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td>{log.distance_meters != null ? `${log.distance_meters} מ׳` : <span className="mutedCell">-</span>}</td>
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
