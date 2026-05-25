'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download } from 'lucide-react'
import { formatDateTime, actionLabel, statusLabel } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/excel'
import type { VisitLog } from '@/lib/supabase/types'

export default function ReportsTab() {
  const supabase = createClient()
  const [logs, setLogs] = useState<VisitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ from: '', to: '', inspector: '', location: '', action: '' })
  const [inspectorList, setInspectorList] = useState<{ id: string; full_name: string }[]>([])
  const [locationList, setLocationList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: logsData }, { data: insp }, { data: locs }] = await Promise.all([
      supabase.from('visit_logs')
        .select('*, inspector:profiles(id,full_name), location:locations(id,name,city)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('profiles').select('id,full_name').eq('role', 'mashgiach').order('full_name'),
      supabase.from('locations').select('id,name').order('name'),
    ])
    setLogs((logsData ?? []) as VisitLog[])
    setInspectorList(insp ?? [])
    setLocationList(locs ?? [])
    setLoading(false)
  }

  const filtered = logs.filter(l => {
    if (filters.inspector && l.inspector_id !== filters.inspector) return false
    if (filters.location && l.location_id !== filters.location) return false
    if (filters.action && l.action_type !== filters.action) return false
    if (filters.from && l.created_at < filters.from) return false
    if (filters.to && l.created_at > filters.to + 'T23:59:59') return false
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
      'קו רוחב': l.device_lat ?? '',
      'קו אורך': l.device_lng ?? '',
      'מרחק (מ׳)': l.distance_meters ?? '',
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
                {inspectorList.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select>
            </label>
            <label className="field"><span>מקום</span>
              <select value={filters.location}
                onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}>
                <option value="">הכל</option>
                {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
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
                  <th>עיר</th><th>סטטוס</th><th>מרחק</th><th>GPS</th>
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
                      <td>{loc?.name ?? <span className="mutedCell">-</span>}</td>
                      <td>{loc?.city ?? <span className="mutedCell">-</span>}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td>{log.distance_meters != null ? `${log.distance_meters} מ׳` : <span className="mutedCell">-</span>}</td>
                      <td>
                        {log.device_lat && log.device_lng
                          ? <a className="coordsLink"
                              href={`https://www.google.com/maps?q=${log.device_lat},${log.device_lng}`}
                              target="_blank" rel="noreferrer">
                              {log.device_lat.toFixed(5)},{log.device_lng.toFixed(5)}
                            </a>
                          : <span className="mutedCell">-</span>}
                      </td>
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
