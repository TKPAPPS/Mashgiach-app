'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CircleCheck, Users, CalendarDays, AlertTriangle, ListChecks, ChevronDown, ChevronUp, Clock
} from 'lucide-react'
import { formatDateTime, statusLabel, actionLabel } from '@/lib/utils/format'
import { computeTimeSpent } from '@/lib/utils/visits'
import type { VisitLog, GpsAlert, VisitCheck } from '@/lib/supabase/types'
import type { SharedInspector, SharedLocation } from './AdminShell'
import CitiesManager from './CitiesManager'

type Props = {
  refreshKey: number
  inspectors: SharedInspector[]
  locations: SharedLocation[]
  onCitiesChanged: () => void
}

export default function DashboardTab({ refreshKey, inspectors, locations, onCitiesChanged }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [alerts, setAlerts] = useState<GpsAlert[]>([])
  const [completions, setCompletions] = useState<VisitCheck[]>([])
  const [stats, setStats] = useState({ total: 0, inspectors: 0, thisMonth: 0 })
  const [filters, setFilters] = useState({ from: '', to: '', inspector: '', location: '', city: '', action: '' })
  const [loading, setLoading] = useState(true)
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => { loadAll() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadAll()
    }, 30000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [
      { data: logsData },
      { data: alertsData },
      { data: checksData },
      { count: total },
      { count: thisMonth },
      { count: inspCount },
    ] = await Promise.all([
      supabase.from('visit_logs')
        .select('id,action_type,location_id,inspector_id,internal_status,device_lat,device_lng,distance_meters,created_at,inspector:profiles(id,full_name),location:locations(id,name,city)')
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('gps_alerts')
        .select('id,created_at,action_type,distance_meters,read,inspector:profiles(id,full_name),location:locations(id,name,city),visit_log:visit_logs(device_lat,device_lng)')
        .eq('read', false).order('created_at', { ascending: false }).limit(10),
      supabase.from('visit_checks')
        .select('id,visit_log_id,item_name,note,created_at,inspector:profiles(id,full_name),location:locations(id,name)')
        .order('created_at', { ascending: false }).limit(150),
      supabase.from('visit_logs').select('id', { count: 'estimated', head: true }),
      supabase.from('visit_logs').select('id', { count: 'estimated', head: true }).gte('created_at', monthStart),
      supabase.from('profiles').select('id', { count: 'estimated', head: true }).eq('role', 'mashgiach'),
    ])

    setLogs((logsData ?? []) as VisitLog[])
    setAlerts((alertsData ?? []) as GpsAlert[])
    setCompletions((checksData ?? []) as VisitCheck[])
    setStats({
      total: total ?? 0,
      inspectors: inspCount ?? 0,
      thisMonth: thisMonth ?? 0,
    })
    setLoading(false)
  }

  const filtered = logs.filter(l => {
    if (filters.inspector && l.inspector_id !== filters.inspector) return false
    if (filters.location && l.location_id !== filters.location) return false
    if (filters.action && l.action_type !== filters.action) return false
    if (filters.city && (l.location as { city?: string | null } | undefined)?.city !== filters.city) return false
    if (filters.from && l.created_at < filters.from) return false
    if (filters.to && l.created_at > filters.to + 'T23:59:59') return false
    return true
  })

  const cities = [...new Set(locations.map(l => l.city).filter(Boolean))]

  // Time spent at location ("H:MM") keyed by the exit log id, computed over all
  // loaded logs so entry/exit pairs are not split by the table filters.
  const timeSpent = useMemo(() => computeTimeSpent(logs), [logs])

  // Group the most recent completed checks by visit so the dashboard shows what
  // each inspector actually marked done. Cap at the latest 15 visits.
  const completionGroups = (() => {
    const map = new Map<string, VisitCheck[]>()
    const order: string[] = []
    for (const c of completions) {
      const key = c.visit_log_id ?? c.id
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key)!.push(c)
    }
    return order.slice(0, 15).map(key => map.get(key)!)
  })()

  const byLocation = filtered.filter(l => l.internal_status === 'success').reduce((acc, l) => {
    const key = l.location_id ?? ''
    const loc = l.location as { id: string; name: string; city: string | null } | undefined
    if (!acc[key]) acc[key] = { name: loc?.name ?? '-', city: loc?.city ?? '-', count: 0 }
    acc[key].count++
    return acc
  }, {} as Record<string, { name: string; city: string; count: number }>)

  const lastVisit = Object.values(
    filtered.reduce((acc, l) => {
      const key = l.location_id ?? ''
      const loc = l.location as { id: string; name: string; city: string | null } | undefined
      const insp = l.inspector as { id: string; full_name: string } | undefined
      if (!acc[key]) acc[key] = { name: loc?.name ?? '-', city: loc?.city ?? '-', inspector: insp?.full_name ?? '-', at: l.created_at }
      else if (l.created_at > acc[key].at) acc[key] = { ...acc[key], inspector: insp?.full_name ?? '-', at: l.created_at }
      return acc
    }, {} as Record<string, { name: string; city: string; inspector: string; at: string }>)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* GPS Alerts banner */}
      {alerts.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
          <div className="card__header--inline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)' }}>
                <AlertTriangle size={16} /> {alerts.length} חריגות GPS לא מטופלות
              </div>
              <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>
                המשגיח סרק QR ממרחק העולה על 100 מטר מהמקום. יתכן שינוי מיקום חשוד. סמן כנקרא לאחר בדיקה.
              </p>
            </div>
            <button
              className="button button--ghost button--sm"
              style={{ flexShrink: 0 }}
              onClick={async () => {
                const ids = alerts.map(a => a.id)
                await supabase.from('gps_alerts').update({ read: true }).in('id', ids)
                setAlerts([])
              }}>
              סמן הכל כנקרא
            </button>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>זמן</th><th>משגיח</th><th>מקום</th><th>פעולה</th><th>מרחק מהמקום</th><th>מיקום</th><th></th></tr></thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id}>
                    <td className="noWrap">{formatDateTime(a.created_at)}</td>
                    <td>{(a.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                    <td>{(a.location as { name: string } | undefined)?.name ?? '-'}</td>
                    <td>{actionLabel(a.action_type ?? '')}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--warning)' }}>
                        {a.distance_meters ? `${a.distance_meters} מ׳` : '-'}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const vl = a.visit_log as { device_lat?: number | null; device_lng?: number | null } | undefined
                        return vl?.device_lat && vl?.device_lng
                          ? <a className="coordsLink" href={`https://www.google.com/maps?q=${vl.device_lat},${vl.device_lng}`} target="_blank" rel="noreferrer">מפה</a>
                          : <span className="mutedCell">-</span>
                      })()}
                    </td>
                    <td>
                      <button className="button button--ghost button--sm" onClick={async () => {
                        await supabase.from('gps_alerts').update({ read: true }).eq('id', a.id)
                        setAlerts(prev => prev.filter(x => x.id !== a.id))
                      }}>סמן כנקרא</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="statsGrid">
        {[
          { icon: CircleCheck,  label: 'סה״כ לוגים',       value: stats.total },
          { icon: Users,        label: 'משגיחים פעילים',   value: stats.inspectors },
          { icon: CalendarDays, label: 'חודש נוכחי',       value: stats.thisMonth },
        ].map(({ icon: Icon, label, value }) => (
          <article key={label} className="statCard">
            <div className="statCard__icon"><Icon size={16} aria-hidden /></div>
            <div className="statCard__text">
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </div>

      {/* Recent completions: what inspectors marked done on exit */}
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={16} /> בדיקות שבוצעו לאחרונה
          </div>
        </div>
        <div className="card__body">
          {completionGroups.length === 0
            ? <div className="emptyState">אין בדיקות שבוצעו עדיין.</div>
            : <div className="summaryGrid">
                {completionGroups.map((group, i) => {
                  const first = group[0]
                  const insp = (first.inspector as { full_name: string } | undefined)?.full_name ?? '-'
                  const loc = (first.location as { name: string } | undefined)?.name ?? '-'
                  return (
                    <div key={first.visit_log_id ?? i} className="card" style={{ margin: 0 }}>
                      <div className="card__header" style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{loc}</div>
                        <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                          {formatDateTime(first.created_at)} | {insp}
                        </div>
                      </div>
                      <div className="tableWrap" style={{ margin: 0 }}>
                        <table>
                          <thead><tr><th>בדיקה</th><th>הערה</th></tr></thead>
                          <tbody>
                            {group.map(c => (
                              <tr key={c.id}>
                                <td>{c.item_name ?? '-'}</td>
                                <td>{c.note ?? <span className="mutedCell">-</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>}
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">סינון</div>
          <CitiesManager locations={locations} onChanged={onCitiesChanged} />
        </div>
        <div className="card__body">
          <div className="filtersGrid">
            <label className="field"><span>מתאריך</span>
              <input type="date" value={filters.from} onChange={e => setFilters(f => ({...f, from: e.target.value}))} />
            </label>
            <label className="field"><span>עד תאריך</span>
              <input type="date" value={filters.to} onChange={e => setFilters(f => ({...f, to: e.target.value}))} />
            </label>
            <label className="field"><span>משגיח</span>
              <select value={filters.inspector} onChange={e => setFilters(f => ({...f, inspector: e.target.value}))}>
                <option value="">הכל</option>
                {inspectors.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select>
            </label>
            <label className="field"><span>מקום</span>
              <select value={filters.location} onChange={e => setFilters(f => ({...f, location: e.target.value}))}>
                <option value="">הכל</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="field"><span>עיר</span>
              <select value={filters.city} onChange={e => setFilters(f => ({...f, city: e.target.value}))}>
                <option value="">הכל</option>
                {cities.map(c => <option key={c} value={c!}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span>סוג פעולה</span>
              <select value={filters.action} onChange={e => setFilters(f => ({...f, action: e.target.value}))}>
                <option value="">הכל</option>
                <option value="entry">כניסה</option>
                <option value="exit">יציאה</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Main log table (hidden by default) */}
      <div className="card">
        <button
          className="card__header--inline"
          onClick={() => setShowLogs(s => !s)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'inherit' }}>
          <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showLogs ? <ChevronUp size={16} /> : <ChevronDown size={16} />} כל הלוגים האחרונים
          </div>
          <span className="textSm textMuted">{showLogs ? 'הסתר' : 'הצג'} ({filtered.length})</span>
        </button>
        {showLogs && (
          <div style={{ padding: '0 0 4px' }}>
            {loading ? <div className="emptyState"><span className="spinner" /></div> :
            filtered.length === 0 ? <div className="emptyState">אין נתונים.</div> :
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>תאריך ושעה</th><th>פעולה</th><th>משגיח</th><th>מקום</th>
                    <th>עיר</th><th>זמן במקום</th><th>סטטוס</th><th>GPS מכשיר</th><th>מרחק</th>
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
                        <td>{insp?.full_name ?? '-'}</td>
                        <td>{loc?.name ?? <span className="mutedCell">לא זוהה</span>}</td>
                        <td>{loc?.city ?? <span className="mutedCell">-</span>}</td>
                        <td>
                          {log.action_type === 'exit' && timeSpent[log.id]
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} aria-hidden />{timeSpent[log.id]}</span>
                            : <span className="mutedCell">-</span>}
                        </td>
                        <td><span className={`badge ${cls}`}>{label}</span></td>
                        <td>
                          {log.device_lat && log.device_lng
                            ? <a className="coordsLink" href={`https://www.google.com/maps?q=${log.device_lat},${log.device_lng}`} target="_blank" rel="noreferrer">
                                {log.device_lat.toFixed(6)}, {log.device_lng.toFixed(6)}
                              </a>
                            : <span className="mutedCell">-</span>}
                        </td>
                        <td>{log.distance_meters != null ? `${log.distance_meters} מ׳` : <span className="mutedCell">-</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>}
          </div>
        )}
      </div>

      {/* Summary tables */}
      <div className="summaryGrid">
        <div className="card">
          <div className="card__header--inline"><div className="card__title">כניסות לפי מקום</div></div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>מקום</th><th>עיר</th><th>כניסות</th></tr></thead>
              <tbody>
                {Object.values(byLocation).length === 0
                  ? <tr><td colSpan={3} className="emptyState">אין נתונים.</td></tr>
                  : Object.values(byLocation).sort((a,b) => b.count - a.count).map((r, i) => (
                    <tr key={i}><td>{r.name}</td><td>{r.city}</td><td>{r.count}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card__header--inline"><div className="card__title">ביקור אחרון לפי מיקום</div></div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>מקום</th><th>עיר</th><th>משגיח</th><th>לפני</th></tr></thead>
              <tbody>
                {lastVisit.length === 0
                  ? <tr><td colSpan={4} className="emptyState">אין נתונים.</td></tr>
                  : lastVisit.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td><td>{r.city}</td><td>{r.inspector}</td>
                      <td className="textMuted textSm">{formatDateTime(r.at)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
