'use client'
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CircleCheck, Users, CalendarDays, AlertTriangle, ListChecks, ChevronDown, ChevronUp
} from 'lucide-react'
import { formatDateTime, statusLabel, actionLabel, gpsAlertLabel, formatDistance } from '@/lib/utils/format'
import { visitCells, PAIRING_MARGIN_MS, bangkokDateOf, bangkokRange } from '@/lib/utils/visits'
import VisitTimeCell from './VisitTimeCell'
import type { VisitLog, GpsAlert, VisitCheck } from '@/lib/supabase/types'
import type { SharedInspector, SharedLocation } from './AdminShell'
import CitiesManager from './CitiesManager'
import Modal from '@/components/ui/Modal'

type Props = {
  refreshKey: number
  inspectors: SharedInspector[]
  locations: SharedLocation[]
  onCitiesChanged: () => void
}

const ALERT_PAGE = 20

export default function DashboardTab({ refreshKey, inspectors, locations, onCitiesChanged }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [alerts, setAlerts] = useState<GpsAlert[]>([])
  const [alertsTotal, setAlertsTotal] = useState(0)
  const [alertLimit, setAlertLimit] = useState(ALERT_PAGE)
  const [confirmReadAll, setConfirmReadAll] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const alertLimitRef = useRef(ALERT_PAGE)
  alertLimitRef.current = alertLimit
  const [completions, setCompletions] = useState<VisitCheck[]>([])
  const [stats, setStats] = useState({ total: 0, inspectors: 0, thisMonth: 0 })
  const [filters, setFilters] = useState({ from: '', to: '', inspector: '', location: '', city: '', action: '' })
  const [loading, setLoading] = useState(true)
  const [showLogs, setShowLogs] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rowChecks, setRowChecks] = useState<Record<string, VisitCheck[]>>({})

  // loadAll reads the active date range via a ref so the 30s auto-refresh and
  // the range effect both use the latest filters without stale closures.
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => { loadAll() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadAll()
    }, 30000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When a date range is chosen, fetch that range from the server (the default
  // view only loads the latest rows, so old days would otherwise be empty).
  const firstRange = useRef(true)
  useEffect(() => {
    if (firstRange.current) { firstRange.current = false; return }
    loadAll()
  }, [filters.from, filters.to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    const monthStart = bangkokRange(`${bangkokDateOf(new Date().toISOString()).slice(0, 8)}01`).fromIso!
    const f = filtersRef.current
    const hasRange = !!(f.from || f.to)
    // Date inputs are Bangkok calendar days; pin the bounds to +07:00 so the
    // window matches the emailed daily report (which also uses Asia/Bangkok).
    // Logs are fetched with a pairing margin either side so a visit crossing the
    // range edge still pairs; rows outside the range are hidden in `filtered`.
    const { fromIso: fromBound, toIso: toBound } = bangkokRange(f.from, f.to)
    const shift = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString()

    let logsQuery = supabase.from('visit_logs')
      .select('id,action_type,location_id,inspector_id,internal_status,device_lat,device_lng,distance_meters,created_at,inspector:profiles(id,full_name),location:locations(id,name,city)')
      .order('created_at', { ascending: false })
    let checksQuery = supabase.from('visit_checks')
      .select('id,visit_log_id,item_name,note,created_at,inspector:profiles(id,full_name),location:locations(id,name)')
      .order('created_at', { ascending: false })

    if (hasRange) {
      if (fromBound) { logsQuery = logsQuery.gte('created_at', shift(fromBound, -PAIRING_MARGIN_MS)); checksQuery = checksQuery.gte('created_at', fromBound) }
      if (toBound) { logsQuery = logsQuery.lt('created_at', shift(toBound, PAIRING_MARGIN_MS)); checksQuery = checksQuery.lt('created_at', toBound) }
      logsQuery = logsQuery.limit(1000); checksQuery = checksQuery.limit(1000)
    } else {
      logsQuery = logsQuery.limit(50); checksQuery = checksQuery.limit(40)
    }

    const [
      { data: logsData },
      { data: alertsData },
      { count: unreadAlerts },
      { data: checksData },
      { count: total },
      { count: thisMonth },
      { count: inspCount },
    ] = await Promise.all([
      logsQuery,
      supabase.from('gps_alerts')
        .select('id,created_at,action_type,distance_meters,alert_type,read,inspector:profiles(id,full_name),location:locations(id,name,city),visit_log:visit_logs(device_lat,device_lng)')
        .eq('read', false).order('created_at', { ascending: false }).limit(alertLimitRef.current),
      supabase.from('gps_alerts').select('id', { count: 'exact', head: true }).eq('read', false),
      checksQuery,
      supabase.from('visit_logs').select('id', { count: 'estimated', head: true }),
      supabase.from('visit_logs').select('id', { count: 'estimated', head: true }).gte('created_at', monthStart),
      supabase.from('profiles').select('id', { count: 'estimated', head: true }).eq('role', 'mashgiach'),
    ])

    setLogs((logsData ?? []) as VisitLog[])
    setAlerts((alertsData ?? []) as GpsAlert[])
    setAlertsTotal(unreadAlerts ?? 0)
    setCompletions((checksData ?? []) as VisitCheck[])
    setStats({
      total: total ?? 0,
      inspectors: inspCount ?? 0,
      thisMonth: thisMonth ?? 0,
    })
    setLoading(false)
  }

  // Expand a log row to show the checklist items marked during that visit.
  // Checks are fetched on demand by visit_log_id and cached.
  async function toggleRow(logId: string) {
    if (expandedId === logId) { setExpandedId(null); return }
    setExpandedId(logId)
    if (!rowChecks[logId]) {
      const { data } = await supabase.from('visit_checks')
        .select('id,item_name,note,created_at')
        .eq('visit_log_id', logId).order('created_at', { ascending: true })
      setRowChecks(prev => ({ ...prev, [logId]: (data ?? []) as VisitCheck[] }))
    }
  }

  // Date range is applied server-side (in Bangkok time) by loadAll; the
  // remaining filters are client-side over the fetched rows.
  const filtered = logs.filter(l => {
    const day = bangkokDateOf(l.created_at)
    if (filters.from && day < filters.from) return false
    if (filters.to && day > filters.to) return false
    if (filters.inspector && l.inspector_id !== filters.inspector) return false
    if (filters.location && l.location_id !== filters.location) return false
    if (filters.action && l.action_type !== filters.action) return false
    if (filters.city && (l.location as { city?: string | null } | undefined)?.city !== filters.city) return false
    return true
  })

  const cities = [...new Set(locations.map(l => l.city).filter(Boolean))]

  // Visit time column keyed by log id, computed over all loaded logs (including
  // the pairing margin) so entry/exit pairs are not split by the table filters.
  const timeSpent = useMemo(() => visitCells(logs), [logs])

  // Group the most recent completed checks by visit so the dashboard shows what
  // each inspector actually marked done. Cap at the latest 15 visits.
  const completionGroups = useMemo(() => {
    const map = new Map<string, VisitCheck[]>()
    const order: string[] = []
    for (const c of completions) {
      const key = c.visit_log_id ?? c.id
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key)!.push(c)
    }
    return order.slice(0, 15).map(key => map.get(key)!)
  }, [completions])

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
      {alertsTotal > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
          <div className="card__header--inline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)' }}>
                <AlertTriangle size={16} /> {alertsTotal} חריגות GPS לא מטופלות
              </div>
              <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>
                סריקה רחוקה מהמסעדה, סריקה שנחסמה בגלל מיקום, או נסיעה בלתי אפשרית בין שתי סריקות. סמן כנקרא לאחר בדיקה.
              </p>
            </div>
            <button
              className="button button--ghost button--sm"
              style={{ flexShrink: 0 }}
              onClick={() => setConfirmReadAll(true)}>
              סמן הכל כנקרא
            </button>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>זמן</th><th>משגיח</th><th>מקום</th><th>פעולה</th><th>חריגה</th><th>מיקום</th><th></th></tr></thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id}>
                    <td className="noWrap">{formatDateTime(a.created_at)}</td>
                    <td>{(a.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                    <td>{(a.location as { name: string } | undefined)?.name ?? '-'}</td>
                    <td>{actionLabel(a.action_type ?? '')}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--warning)' }}>
                        {gpsAlertLabel(a.alert_type, a.distance_meters)}
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
                        setAlertsTotal(t => Math.max(0, t - 1))
                      }}>סמן כנקרא</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alerts.length < alertsTotal && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '10px 14px 14px' }}>
              <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>מוצגות {alerts.length} מתוך {alertsTotal}</span>
              <button className="button button--ghost button--sm" onClick={() => {
                const next = alertLimit + ALERT_PAGE * 5
                alertLimitRef.current = next
                setAlertLimit(next)
                loadAll()
              }}>טען עוד</button>
            </div>
          )}
        </div>
      )}

      <Modal open={confirmReadAll} onClose={() => setConfirmReadAll(false)} title="סימון כל ההתראות כנקראו"
        footer={<>
          <button className="button button--ghost" onClick={() => setConfirmReadAll(false)}>ביטול</button>
          <button className="button button--primary" disabled={markingAll} onClick={async () => {
            setMarkingAll(true)
            const res = await fetch('/api/admin/gps-alerts', { method: 'PATCH' })
            setMarkingAll(false)
            setConfirmReadAll(false)
            if (res.ok) { setAlerts([]); setAlertsTotal(0) }
            loadAll()
          }}>{markingAll ? <span className="spinner" /> : `סמן ${alertsTotal} כנקראו`}</button>
        </>}>
        <p>לסמן את כל {alertsTotal} חריגות ה-GPS שלא טופלו כנקראו, כולל אלו שלא מוצגות ברשימה? ההתראות נשמרות במערכת ולא נמחקות.</p>
      </Modal>

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
          <CitiesManager onChanged={onCitiesChanged} />
        </div>
        <div className="card__body">
          <div className="filtersGrid">
            <label className="field"><span>יום ספציפי</span>
              <input type="date" value={filters.from && filters.from === filters.to ? filters.from : ''}
                onChange={e => { const d = e.target.value; setFilters(f => ({ ...f, from: d, to: d })) }} />
            </label>
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
                    const isExit = log.action_type === 'exit'
                    const isOpen = expandedId === log.id
                    const checks = rowChecks[log.id]
                    return (
                      <Fragment key={log.id}>
                      <tr onClick={isExit ? () => toggleRow(log.id) : undefined}
                        style={isExit ? { cursor: 'pointer' } : undefined}>
                        <td className="noWrap">{formatDateTime(log.created_at)}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {isExit && (isOpen ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />)}
                            {actionLabel(log.action_type)}
                          </span>
                        </td>
                        <td>{insp?.full_name ?? '-'}</td>
                        <td>{loc?.name ?? <span className="mutedCell">לא זוהה</span>}</td>
                        <td>{loc?.city ?? <span className="mutedCell">-</span>}</td>
                        <td>
                          <VisitTimeCell cell={timeSpent[log.id]} />
                        </td>
                        <td><span className={`badge ${cls}`}>{label}</span></td>
                        <td>
                          {log.device_lat && log.device_lng
                            ? <a className="coordsLink" href={`https://www.google.com/maps?q=${log.device_lat},${log.device_lng}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                {log.device_lat.toFixed(6)}, {log.device_lng.toFixed(6)}
                              </a>
                            : <span className="mutedCell">-</span>}
                        </td>
                        <td className="noWrap">{log.distance_meters != null ? formatDistance(log.distance_meters) : <span className="mutedCell">-</span>}</td>
                      </tr>
                      {isExit && isOpen && (
                        <tr>
                          <td colSpan={9} style={{ background: 'var(--bg-muted, #f8fafc)', padding: '6px 14px' }}>
                            {checks === undefined ? <span className="textSm textMuted">טוען...</span> :
                             checks.length === 0 ? <span className="textSm textMuted">לא תועדו בדיקות בביקור זה.</span> :
                             <table style={{ margin: 0 }}>
                               <thead><tr><th>בדיקה</th><th>הערה</th></tr></thead>
                               <tbody>
                                 {checks.map(c => (
                                   <tr key={c.id}><td>{c.item_name ?? '-'}</td><td>{c.note ?? <span className="mutedCell">-</span>}</td></tr>
                                 ))}
                               </tbody>
                             </table>}
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
