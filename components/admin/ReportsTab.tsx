'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Camera } from 'lucide-react'
import { formatDateTime, actionLabel, statusLabel, formatDistance } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/excel'
import type { VisitLog } from '@/lib/supabase/types'
import type { SharedInspector, SharedLocation } from './AdminShell'
import { visitCells, bangkokDateOf, bangkokRange, PAIRING_MARGIN_MS, type VisitCell } from '@/lib/utils/visits'
import VisitTimeCell from './VisitTimeCell'
import VisitPhotosModal from './VisitPhotosModal'

function thirtyDaysAgo() {
  return bangkokDateOf(new Date(Date.now() - 30 * 24 * 3600_000).toISOString())
}

const DEFAULT_FROM = thirtyDaysAgo()

type Props = {
  refreshKey: number
  inspectors: SharedInspector[]
  locations: SharedLocation[]
}

export default function ReportsTab({ refreshKey, inspectors, locations }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ from: DEFAULT_FROM, to: '', inspector: '', location: '', action: '', search: '' })
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [photoModalId, setPhotoModalId] = useState<string | null>(null)
  const [timeSpent, setTimeSpent] = useState<Record<string, VisitCell>>({})

  useEffect(() => { loadAll(filters.from) }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    loadAll(filters.from)
  }, [filters.from]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll(fromDate = filters.from) {
    setLoading(true)
    const q = supabase.from('visit_logs')
      .select('*, inspector:profiles(id,full_name), location:locations(id,name,city)')
      .order('created_at', { ascending: false })
      .limit(500)
    // Bangkok day bounds, fetched with a margin so a visit that started before
    // the range (or crosses midnight) still pairs; the margin rows are hidden below.
    const { fromIso } = bangkokRange(fromDate)
    if (fromIso) q.gte('created_at', new Date(new Date(fromIso).getTime() - PAIRING_MARGIN_MS).toISOString())
    const { data: logsData } = await q
    const list = (logsData ?? []) as VisitLog[]
    setLogs(list)
    setTimeSpent(visitCells(list))
    setLoading(false)

    // Batch-fetch photo counts (single query)
    if (list.length > 0) {
      const res = await fetch('/api/admin/visit-photo-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: list.map(l => l.id) }),
      })
      if (res.ok) setPhotoCounts(await res.json())
    }
  }

  const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()
  const q = norm(filters.search)
  const filtered = logs.filter(l => {
    if (filters.inspector && l.inspector_id !== filters.inspector) return false
    if (filters.location && l.location_id !== filters.location) return false
    if (filters.action && l.action_type !== filters.action) return false
    const day = bangkokDateOf(l.created_at)
    if (filters.from && day < filters.from) return false
    if (filters.to && day > filters.to) return false
    if (q) {
      const haystack = [
        (l.inspector as { full_name?: string } | undefined)?.full_name ?? '',
        (l.location as { name?: string } | undefined)?.name ?? '',
        statusLabel(l.internal_status).label,
        actionLabel(l.action_type),
        l.action_type,        // raw 'entry' / 'exit'
        l.internal_status,    // raw 'gps_mismatch' / 'unauthorized' / ...
      ].map(norm)
      if (!haystack.some(h => h.includes(q))) return false
    }
    return true
  })

  function handleExport() {
    const rows = filtered.map(l => ({
      'תאריך ושעה': formatDateTime(l.created_at),
      'פעולה': actionLabel(l.action_type),
      'משגיח': (l.inspector as { full_name: string } | undefined)?.full_name ?? '-',
      'מקום': (l.location as { name: string } | undefined)?.name ?? '-',
      'עיר': (l.location as { city: string | null } | undefined)?.city ?? '-',
      'סטטוס': statusLabel(l.internal_status).label,
      'זמן שהייה': timeSpent[l.id]?.text ?? '',
      'קו רוחב': l.device_lat ?? '',
      'קו אורך': l.device_lng ?? '',
      'מרחק (מ׳)': l.distance_meters ?? '',
      'תמונות': photoCounts[l.id] ?? 0,
    }))
    exportToExcel(rows, `דיווחים_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}`, 'דיווחים')
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
            <label className="field"><span>משגיח</span>
              <select value={filters.inspector}
                onChange={e => setFilters(f => ({ ...f, inspector: e.target.value }))}>
                <option value="">הכל</option>
                {inspectors.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select>
            </label>
            <label className="field"><span>מקום</span>
              <select value={filters.location}
                onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}>
                <option value="">הכל</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="field"><span>סוג פעולה</span>
              <select value={filters.action}
                onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
                <option value="">הכל</option>
                <option value="entry">כניסה</option>
                <option value="exit">יציאה</option>
              </select>
            </label>
            <label className="field"><span>חיפוש חופשי</span>
              <input type="text" value={filters.search} placeholder="שם משגיח, מקום או סטטוס"
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </label>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="button button--primary button--sm" onClick={() => loadAll(filters.from)}>טען</button>
            <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>מוצגים נתוני 30 הימים האחרונים. שינוי תאריך התחלה מרענן אוטומטית.</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">דיווחים ({filtered.length})</div>
          <button className="button button--ghost button--sm" onClick={handleExport}>
            <Download size={14} /> ייצא Excel
          </button>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          filtered.length === 0 ? <div className="emptyState">אין נתונים.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>תאריך ושעה</th><th>פעולה</th><th>משגיח</th><th>מקום</th>
                  <th>עיר</th><th>סטטוס</th><th>זמן שהייה</th><th>מרחק</th><th>GPS</th><th>תמונות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => {
                  const { label, cls } = statusLabel(log.internal_status)
                  const insp = log.inspector as { full_name: string } | undefined
                  const loc = log.location as { name: string; city: string | null } | undefined
                  const count = photoCounts[log.id] ?? 0
                  return (
                    <tr key={log.id}>
                      <td className="noWrap">{formatDateTime(log.created_at)}</td>
                      <td>{actionLabel(log.action_type)}</td>
                      <td>{insp?.full_name ?? '-'}</td>
                      <td>{loc?.name ?? <span className="mutedCell">-</span>}</td>
                      <td>{loc?.city ?? <span className="mutedCell">-</span>}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td className="noWrap"><VisitTimeCell cell={timeSpent[log.id]} /></td>
                      <td className="noWrap">{log.distance_meters != null ? formatDistance(log.distance_meters) : <span className="mutedCell">-</span>}</td>
                      <td>
                        {log.device_lat && log.device_lng
                          ? <a className="coordsLink"
                              href={`https://www.google.com/maps?q=${log.device_lat},${log.device_lng}`}
                              target="_blank" rel="noreferrer">
                              {log.device_lat.toFixed(5)},{log.device_lng.toFixed(5)}
                            </a>
                          : <span className="mutedCell">-</span>}
                      </td>
                      <td>
                        {count > 0 ? (
                          <button
                            className="button button--icon button--ghost"
                            style={{ position: 'relative' }}
                            title="צפה בתמונות"
                            onClick={() => setPhotoModalId(log.id)}>
                            <Camera size={15} />
                            <span style={{
                              position: 'absolute', top: 0, right: 0,
                              background: 'var(--primary)', color: '#fff',
                              borderRadius: 99, fontSize: '.6rem', minWidth: 14, height: 14,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 3px', lineHeight: 1,
                            }}>{count}</span>
                          </button>
                        ) : <span className="mutedCell">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>}
        </div>
      </div>

      {photoModalId && (
        <VisitPhotosModal visitLogId={photoModalId} onClose={() => setPhotoModalId(null)} />
      )}
    </div>
  )
}
