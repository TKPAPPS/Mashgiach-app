'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Camera, X } from 'lucide-react'
import { formatDateTime, actionLabel, statusLabel } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/excel'
import type { VisitLog } from '@/lib/supabase/types'
import type { SharedInspector, SharedLocation } from './AdminShell'
import { computeTimeSpent } from '@/lib/utils/visits'

function thirtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FROM = thirtyDaysAgo()

type VisitPhoto = { id: string; url: string | null; created_at: string }

function PhotoViewerModal({ visitLogId, onClose }: { visitLogId: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<VisitPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/visit-photos?visit_log_id=${visitLogId}`)
      .then(r => r.json())
      .then(data => { setPhotos(Array.isArray(data) ? data : []); setLoading(false) })
  }, [visitLogId])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560,
        margin: '0 16px', padding: '20px 16px 24px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>תמונות לביקור</strong>
          <button className="button button--icon button--ghost" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><span className="spinner" /></div>
        ) : photos.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>אין תמונות לביקור זה.</p>
        ) : (
          <div style={{ overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {photos.map(p => p.url && (
                <div key={p.id} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--border)', cursor: 'pointer' }}
                  onClick={() => setLightbox(p.url)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
          <button style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  )
}

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
  const [timeSpent, setTimeSpent] = useState<Record<string, string>>({})

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
    if (fromDate) q.gte('created_at', fromDate)
    const { data: logsData } = await q
    const list = (logsData ?? []) as VisitLog[]
    setLogs(list)
    setTimeSpent(computeTimeSpent(list))
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
    if (filters.from && l.created_at < filters.from) return false
    if (filters.to && l.created_at > filters.to + 'T23:59:59') return false
    if (q) {
      const insp = norm((l.inspector as { full_name?: string } | undefined)?.full_name ?? '')
      const loc = norm((l.location as { name?: string } | undefined)?.name ?? '')
      const status = norm(statusLabel(l.internal_status).label)
      if (!insp.includes(q) && !loc.includes(q) && !status.includes(q)) return false
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
      'זמן שהייה': timeSpent[l.id] ?? '',
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
                      <td>{timeSpent[log.id] ? <span style={{ fontSize: '.85rem', color: 'var(--primary)', fontWeight: 500 }}>{timeSpent[log.id]}</span> : <span className="mutedCell">-</span>}</td>
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
        <PhotoViewerModal visitLogId={photoModalId} onClose={() => setPhotoModalId(null)} />
      )}
    </div>
  )
}
