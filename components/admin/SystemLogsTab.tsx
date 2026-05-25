'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, statusLabel, actionLabel } from '@/lib/utils/format'
import type { VisitLog } from '@/lib/supabase/types'

function thirtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FROM = thirtyDaysAgo()

export default function SystemLogsTab() {
  const supabase = createClient()
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ from: DEFAULT_FROM, to: '', action: '', search: '' })

  useEffect(() => { loadLogs(DEFAULT_FROM) }, [])

  async function loadLogs(fromDate = filters.from) {
    setLoading(true)
    const q = supabase
      .from('visit_logs')
      .select('*, inspector:profiles(id,full_name), location:locations(id,name,city)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (fromDate) q.gte('created_at', fromDate)
    const { data } = await q
    setLogs((data ?? []) as VisitLog[])
    setLoading(false)
  }

  const filtered = logs.filter(l => {
    if (filters.action && l.action_type !== filters.action) return false
    if (filters.to && l.created_at > filters.to + 'T23:59:59') return false
    if (filters.search) {
      const insp = (l.inspector as { full_name: string } | undefined)?.full_name ?? ''
      const loc = (l.location as { name: string } | undefined)?.name ?? ''
      if (!insp.includes(filters.search) && !loc.includes(filters.search) &&
          !l.action_type.includes(filters.search) && !l.internal_status.includes(filters.search)) return false
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <label className="field"><span>סוג פעולה</span>
              <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
                <option value="">הכל</option>
                <option value="entry">כניסה</option>
                <option value="exit">יציאה</option>
              </select>
            </label>
            <label className="field"><span>חיפוש חופשי</span>
              <input placeholder="שם, מקום, סטטוס..." value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </label>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="button button--primary button--sm" onClick={() => loadLogs(filters.from)}>טען</button>
            <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>מוצגים נתוני 30 הימים האחרונים. לצפייה בנתונים ישנים יותר, שנה את תאריך ההתחלה ולחץ טען.</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <div className="card__title">לוג ביקורים ({filtered.length})</div>
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
    </div>
  )
}
