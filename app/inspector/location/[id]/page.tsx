'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ExternalLink, QrCode, Camera, X, Trash2 } from 'lucide-react'
import { formatRelative } from '@/lib/utils/format'
import PhotoAddControl from '@/components/ui/PhotoAddControl'
import type { Location, VisitLog, ChecklistItem } from '@/lib/supabase/types'

type VisitPhoto = { id: string; url: string | null; created_at: string }

function PhotoModal({ visitLogId, onClose }: { visitLogId: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<VisitPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/inspector/visit-photos?visit_log_id=${visitLogId}`)
    const data = await res.json()
    setPhotos(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [visitLogId])

  useEffect(() => { load() }, [load])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = 10 - photos.length
    if (remaining <= 0) return
    const toUpload = Array.from(files).slice(0, remaining)
    setUploading(true)
    for (const file of toUpload) {
      const fd = new FormData()
      fd.append('visit_log_id', visitLogId)
      fd.append('file', file)
      const res = await fetch('/api/inspector/visit-photos', { method: 'POST', body: fd })
      if (res.ok) {
        const photo: VisitPhoto = await res.json()
        setPhotos(prev => [...prev, photo])
      }
    }
    setUploading(false)
  }

  async function handleDelete(photoId: string) {
    await fetch(`/api/inspector/visit-photos?id=${photoId}`, { method: 'DELETE' })
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-end',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
        padding: '20px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85svh',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '1rem' }}>תמונות לביקור ({photos.length}/10)</strong>
          <button className="button button--icon button--ghost" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--border)' }}>
                    {p.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setLightbox(p.url)} />
                    )}
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: 6,
                        color: '#fff', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 10 && (
              <PhotoAddControl onFiles={handleFiles} uploading={uploading} remaining={10 - photos.length} />
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '95vw', maxHeight: '90svh', borderRadius: 8, objectFit: 'contain' }} />
          <button style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function InspectorLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const [location, setLocation] = useState<Location | null>(null)
  const [recentVisits, setRecentVisits] = useState<VisitLog[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [photoModalVisitId, setPhotoModalVisitId] = useState<string | null>(null)
  const [procPhotos, setProcPhotos] = useState<{ id: string; note: string | null; url: string | null }[]>([])
  const [procChecks, setProcChecks] = useState<{ id: string; name: string; frequency: string; note: string | null }[]>([])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: loc }, { data: assignment }, { data: visits }, { data: locChecklist }] = await Promise.all([
      supabase.from('locations').select('*').eq('id', id).single(),
      supabase.from('inspector_locations').select('id').eq('inspector_id', user.id).eq('location_id', id).maybeSingle(),
      supabase.from('visit_logs').select('*').eq('location_id', id).eq('inspector_id', user.id)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('checklist_items').select('*').eq('active', true).eq('location_id', id).order('sort_order'),
    ])

    if (!loc || !assignment) { router.push('/inspector'); return }

    // Per-location checklist, falling back to the global default list.
    let checklist = (locChecklist ?? []) as ChecklistItem[]
    if (checklist.length === 0) {
      const { data: globals } = await supabase.from('checklist_items')
        .select('*').eq('active', true).is('location_id', null).order('sort_order')
      checklist = (globals ?? []) as ChecklistItem[]
    }

    const visitList = (visits ?? []) as VisitLog[]
    setLocation(loc as Location)
    setRecentVisits(visitList)
    setChecklistItems(checklist)
    setLoading(false)

    // Procedure appliance photos (signed URLs from the server).
    fetch(`/api/inspector/procedure?location_id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setProcPhotos(d.photos ?? []); setProcChecks(d.checks ?? []) } })
      .catch(() => {})

    // Batch-fetch photo counts (single query)
    if (visitList.length > 0) {
      const res = await fetch('/api/inspector/visit-photo-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: visitList.map(v => v.id) }),
      })
      if (res.ok) setPhotoCounts(await res.json())
    }
  }

  useEffect(() => { loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (!location) return (
    <div className="app" style={{ padding: 24 }}>
      <p>מקום לא נמצא</p>
      <button className="button button--ghost" onClick={() => router.push('/inspector')}>חזור</button>
    </div>
  )

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh' }}>
      <header className="appHeader">
        <button className="button button--icon button--ghost" style={{ color: '#fff', border: 'none' }}
          onClick={() => router.push('/inspector')}>
          <ArrowRight size={18} />
        </button>
        <div className="appHeader__title" style={{ flex: 1, textAlign: 'center' }}>{location.name}</div>
      </header>

      <div style={{ padding: '16px 14px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Details card */}
        <div className="card">
          <div className="card__header"><div className="card__title">פרטי מקום</div></div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {location.city && <div><span className="textMuted textSm">עיר: </span>{location.city}</div>}
            {location.address && <div><span className="textMuted textSm">כתובת: </span>{location.address}</div>}
            {location.contact_name && <div><span className="textMuted textSm">איש קשר: </span>{location.contact_name}</div>}
            {location.contact_phone && (
              <div><span className="textMuted textSm">טלפון: </span>
                <a href={`tel:${location.contact_phone}`}>{location.contact_phone}</a>
              </div>
            )}
          </div>
        </div>

        {/* Work & kashrut procedure: hours, days, required arrival, checks, appliance photos */}
        {(location.opening_hours || location.inspector_arrival_time || location.working_days || procChecks.length > 0 || procPhotos.length > 0) && (
          <div className="card">
            <div className="card__header"><div className="card__title">נוהל עבודה וכשרות</div></div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {location.opening_hours && <div><span className="textMuted textSm">שעות פתיחה: </span>{location.opening_hours}</div>}
              {location.working_days && <div><span className="textMuted textSm">ימי עבודה: </span>{location.working_days.split(',').filter(Boolean).join(', ')}</div>}
              {location.inspector_arrival_time && <div><span className="textMuted textSm">שעת הגעה נדרשת: </span>{location.inspector_arrival_time}</div>}
              {procChecks.length > 0 && (
                <div>
                  <div className="textMuted textSm" style={{ marginBottom: 6 }}>בדיקות כשרות לביצוע</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {procChecks.map(c => (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontSize: '.86rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.name}
                          <span className="badge badge--muted" style={{ fontSize: '.64rem' }}>{c.frequency === 'weekly' ? 'שבועי' : 'יומי'}</span>
                        </div>
                        {c.note && <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.4 }}>{c.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {procPhotos.length > 0 && (
                <div>
                  <div className="textMuted textSm" style={{ marginBottom: 6 }}>תנורים ומכשירי חשמל</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                    {procPhotos.map(p => (
                      <a key={p.id} href={p.url ?? '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                        {p.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
                        )}
                        {p.note && <div style={{ fontSize: '.78rem', marginTop: 4, lineHeight: 1.4 }}>{p.note}</div>}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Kashrus procedure */}
        {(location.kashrus_procedure || location.kashrus_certificate_url) && (
          <div className="card">
            <div className="card__header"><div className="card__title">נוהל כשרות</div></div>
            <div className="card__body">
              {location.kashrus_procedure && (
                <p style={{ fontSize: '.88rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {location.kashrus_procedure}
                </p>
              )}
              {location.kashrus_certificate_url && (
                <a href={location.kashrus_certificate_url} target="_blank" rel="noreferrer"
                  className="button button--ghost button--sm" style={{ marginTop: 10 }}>
                  <ExternalLink size={13} /> תעודת כשרות
                </a>
              )}
            </div>
          </div>
        )}

        {/* Checklist */}
        {checklistItems.length > 0 && (
          <div className="card">
            <div className="card__header"><div className="card__title">רשימת בדיקות</div></div>
            <div className="card__body">
              <div className="checklistWrap">
                {checklistItems.map(item => (
                  <div key={item.id} className="checkItem" style={{ opacity: 0.85, cursor: 'default' }}>
                    <input type="checkbox" disabled style={{ accentColor: 'var(--primary)' }} />
                    <span>{item.name}</span>
                    <span className="badge badge--muted" style={{ fontSize: '.66rem', marginInlineStart: 'auto' }}>
                      {item.frequency === 'weekly' ? 'שבועי' : 'יומי'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="textSm textMuted" style={{ marginTop: 10 }}>
                סמן פריטים אלה עם יציאה מהמקום
              </p>
            </div>
          </div>
        )}

        {/* QR scan */}
        <button className="button button--primary"
          style={{ height: 52, fontSize: '1rem' }}
          onClick={() => router.push('/inspector/scan')}>
          <QrCode size={18} /> סרוק QR לכניסה / יציאה
        </button>

        {/* Recent visits */}
        {recentVisits.length > 0 && (
          <div className="card">
            <div className="card__header"><div className="card__title">ביקורים אחרונים</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {recentVisits.map(v => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderBottom: '1px solid var(--border)',
                  fontSize: '.85rem',
                }}>
                  <span style={{ flex: '0 0 auto' }}>{v.action_type === 'entry' ? 'כניסה' : 'יציאה'}</span>
                  <span className="textMuted" style={{ flex: 1 }}>{formatRelative(v.created_at)}</span>
                  <span className={`badge ${v.internal_status === 'success' ? 'badge--success' : 'badge--warning'}`} style={{ fontSize: '.72rem', flex: '0 0 auto' }}>
                    {v.internal_status === 'success' ? '✓' : '!'}
                  </span>
                  <button
                    className="button button--icon button--ghost"
                    style={{ flex: '0 0 auto', position: 'relative' }}
                    title="תמונות לביקור"
                    onClick={() => setPhotoModalVisitId(v.id)}>
                    <Camera size={15} />
                    {(photoCounts[v.id] ?? 0) > 0 && (
                      <span style={{
                        position: 'absolute', top: 0, right: 0,
                        background: 'var(--primary)', color: '#fff',
                        borderRadius: 99, fontSize: '.6rem', minWidth: 14, height: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 3px', lineHeight: 1,
                      }}>
                        {photoCounts[v.id]}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {photoModalVisitId && (
        <PhotoModal
          visitLogId={photoModalVisitId}
          onClose={() => {
            // Refresh count for that visit after modal closes
            fetch(`/api/inspector/visit-photos?visit_log_id=${photoModalVisitId}`)
              .then(r => r.json())
              .then(data => {
                setPhotoCounts(prev => ({ ...prev, [photoModalVisitId]: Array.isArray(data) ? data.length : 0 }))
              })
              .finally(() => setPhotoModalVisitId(null))
          }}
        />
      )}
    </div>
  )
}
