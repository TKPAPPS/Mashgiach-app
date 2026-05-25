'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils/format'
import type { SystemLog } from '@/lib/supabase/types'

export default function SystemLogsTab() {
  const supabase = createClient()
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('system_logs')
      .select('*, performer:profiles(id,full_name), location:locations(id,name)')
      .order('created_at', { ascending: false })
      .limit(200)
    setLogs((data ?? []) as SystemLog[])
    setLoading(false)
  }

  const filtered = search
    ? logs.filter(l =>
        l.action_type.includes(search) ||
        (l.performer as { full_name: string } | undefined)?.full_name?.includes(search) ||
        (l.location as { name: string } | undefined)?.name?.includes(search)
      )
    : logs

  function renderDetails(details: Record<string, unknown>) {
    try {
      return Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ')
    } catch {
      return '-'
    }
  }

  const statusColors: Record<string, string> = {
    success: 'badge--success',
    error: 'badge--danger',
    warning: 'badge--warning',
  }

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">לוגים ({filtered.length})</div>
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
              <tr><th>זמן</th><th>פעולה</th><th>מבצע</th><th>מקום</th><th>סטטוס</th><th>פרטים</th></tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <tr key={log.id}>
                  <td className="noWrap">{formatDateTime(log.created_at)}</td>
                  <td><code style={{ fontSize: '.78rem' }}>{log.action_type}</code></td>
                  <td>{(log.performer as { full_name: string } | undefined)?.full_name ?? <span className="mutedCell">-</span>}</td>
                  <td>{(log.location as { name: string } | undefined)?.name ?? <span className="mutedCell">-</span>}</td>
                  <td>
                    {log.status
                      ? <span className={`badge ${statusColors[log.status] ?? 'badge--muted'}`}>{log.status}</span>
                      : <span className="mutedCell">-</span>}
                  </td>
                  <td style={{ fontSize: '.78rem', color: 'var(--muted)', maxWidth: 280 }}>
                    {renderDetails(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  )
}
