'use client'
import { useState, useEffect, use, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ExternalLink, QrCode, Camera, X, Trash2, Download } from 'lucide-react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { formatRelative, KASHRUT_TYPE_LABELS } from '@/lib/utils/format'
import MenuSection from '@/components/MenuSection'
import { useToast } from '@/components/ui/Toast'
import { toJpegFile } from '@/lib/utils/image'
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
      fd.append('file', await toJpegFile(file))
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

type ProcPhoto = { id: string; note: string | null; url: string | null }

export default function InspectorLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [location, setLocation] = useState<Location | null>(null)
  const [recentVisits, setRecentVisits] = useState<VisitLog[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [photoModalVisitId, setPhotoModalVisitId] = useState<string | null>(null)
  const [procPhotos, setProcPhotos] = useState<ProcPhoto[]>([])
  // Ticked procedure checks, keyed by checklist_item_id -> its note.
  const [tickedChecks, setTickedChecks] = useState<Record<string, { note: string | null }>>({})
  // Editable structured fields.
  const [openingHours, setOpeningHours] = useState('')
  const [arrivalTime, setArrivalTime] = useState('')
  const [workingDays, setWorkingDays] = useState<string[]>([])
  const [kashrusProcedure, setKashrusProcedure] = useState('')
  const [savingFields, setSavingFields] = useState(false)
  const [savingKashrus, setSavingKashrus] = useState(false)
  // Note edit buffers (keys: `check-<itemId>` / `photo-<photoId>`).
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>({})
  const [newPhotoNote, setNewPhotoNote] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const qrCanvasRef = useRef<HTMLDivElement>(null)
  const checkBusy = useRef<Set<string>>(new Set())

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: loc }, { data: assignment }, { data: visits }, { data: locChecklist }] = await Promise.all([
      supabase.from('locations').select('*').eq('id', id).single(),
      supabase.from('inspector_locations').select('id').eq('inspector_id', user.id).eq('location_id', id).maybeSingle(),
      supabase.from('visit_logs').select('*').eq('location_id', id).eq('inspector_id', user.id)
        .in('internal_status', ['success', 'gps_mismatch'])
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
    const l = loc as Location
    setLocation(l)
    setRecentVisits(visitList)
    setChecklistItems(checklist)
    setOpeningHours(l.opening_hours ?? '')
    setArrivalTime(l.inspector_arrival_time ?? '')
    setWorkingDays(l.working_days ? l.working_days.split(',').filter(Boolean) : [])
    setKashrusProcedure(l.kashrus_procedure ?? '')
    setLoading(false)

    // Procedure appliance photos + ticked checks (signed URLs from the server).
    fetch(`/api/inspector/procedure?location_id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { photos?: ProcPhoto[]; checks?: { checklist_item_id: string; note: string | null }[] } | null) => {
        if (!d) return
        setProcPhotos(d.photos ?? [])
        const map: Record<string, { note: string | null }> = {}
        for (const c of d.checks ?? []) map[c.checklist_item_id] = { note: c.note }
        setTickedChecks(map)
      })
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

  async function saveFields() {
    setSavingFields(true)
    const res = await fetch('/api/inspector/procedure', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id: id,
        opening_hours: openingHours,
        inspector_arrival_time: arrivalTime,
        working_days: workingDays.length ? workingDays.join(',') : '',
      }),
    })
    if (res.ok) {
      const d = await res.json()
      setLocation(prev => prev ? { ...prev, ...d } as Location : prev)
      toast('הנוהל נשמר', 'success')
    } else toast('שגיאה בשמירה', 'error')
    setSavingFields(false)
  }

  async function saveKashrus() {
    setSavingKashrus(true)
    const res = await fetch('/api/inspector/procedure', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: id, kashrus_procedure: kashrusProcedure }),
    })
    if (res.ok) {
      const d = await res.json()
      setLocation(prev => prev ? { ...prev, ...d } as Location : prev)
      toast('נוהל הכשרות נשמר', 'success')
    } else toast('שגיאה בשמירה', 'error')
    setSavingKashrus(false)
  }

  async function toggleCheck(itemId: string) {
    if (checkBusy.current.has(itemId)) return
    checkBusy.current.add(itemId)
    try {
      const ticked = !!tickedChecks[itemId]
      if (ticked) {
        const res = await fetch(`/api/inspector/procedure-checks?location_id=${id}&checklist_item_id=${itemId}`, { method: 'DELETE' })
        if (!res.ok) { toast('שגיאה', 'error'); return }
        setTickedChecks(prev => { const n = { ...prev }; delete n[itemId]; return n })
      } else {
        const res = await fetch('/api/inspector/procedure-checks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: id, checklist_item_id: itemId }),
        })
        if (!res.ok) { toast('שגיאה', 'error'); return }
        const d = await res.json()
        setTickedChecks(prev => ({ ...prev, [itemId]: { note: d.note ?? null } }))
      }
    } finally {
      checkBusy.current.delete(itemId)
    }
  }

  async function saveCheckNote(itemId: string) {
    const note = noteEdits[`check-${itemId}`] ?? ''
    const res = await fetch('/api/inspector/procedure-checks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: id, checklist_item_id: itemId, note }),
    })
    if (!res.ok) { toast('שגיאה', 'error'); return }
    setTickedChecks(prev => ({ ...prev, [itemId]: { note: note || null } }))
    setNoteEdits(prev => { const n = { ...prev }; delete n[`check-${itemId}`]; return n })
    toast('ההערה נשמרה', 'success')
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingPhoto(true)
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('location_id', id)
      form.append('file', await toJpegFile(file))
      if (newPhotoNote.trim()) form.append('note', newPhotoNote.trim())
      const res = await fetch('/api/inspector/procedure-photos', { method: 'POST', body: form })
      if (res.ok) { const created: ProcPhoto = await res.json(); setProcPhotos(prev => [...prev, created]) }
      else { const e = await res.json().catch(() => null); toast(e?.error || 'שגיאה בהעלאת התמונה', 'error') }
    }
    setNewPhotoNote('')
    setUploadingPhoto(false)
  }

  async function deletePhoto(photoId: string) {
    const res = await fetch(`/api/inspector/procedure-photos?id=${photoId}`, { method: 'DELETE' })
    if (res.ok) setProcPhotos(prev => prev.filter(p => p.id !== photoId))
    else toast('שגיאה במחיקה', 'error')
  }

  async function savePhotoNote(photoId: string) {
    const note = noteEdits[`photo-${photoId}`] ?? ''
    const res = await fetch('/api/inspector/procedure-photos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, note }),
    })
    if (res.ok) {
      setProcPhotos(prev => prev.map(p => p.id === photoId ? { ...p, note: note || null } : p))
      setNoteEdits(prev => { const n = { ...prev }; delete n[`photo-${photoId}`]; return n })
      toast('ההערה נשמרה', 'success')
    } else toast('שגיאה', 'error')
  }

  function downloadQr() {
    const canvas = qrCanvasRef.current?.querySelector('canvas')
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `QR-${location?.name ?? 'location'}.png`
    a.click()
  }

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
            {location.kashrut_type && (
              <div><span className={`badge kashrutBadge kashrutBadge--${location.kashrut_type}`}>{KASHRUT_TYPE_LABELS[location.kashrut_type]}</span></div>
            )}
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

        {/* Work & kashrut procedure: editable by the assigned inspector. */}
        <div className="card">
          <div className="card__header"><div className="card__title">נוהל עבודה וכשרות</div></div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Structured fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="field"><span>שעות פתיחה</span>
                <input value={openingHours} onChange={e => setOpeningHours(e.target.value)} placeholder="08:00-22:00" />
              </label>
              <label className="field"><span>שעת הגעת משגיח נדרשת</span>
                <input value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} placeholder="08:30" />
              </label>
              <div className="field">
                <span>ימי עבודה</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['א','ב','ג','ד','ה','ו','ש'].map(d => {
                    const on = workingDays.includes(d)
                    return (
                      <button key={d} type="button"
                        onClick={() => setWorkingDays(prev => on ? prev.filter(x => x !== d) : [...prev, d])}
                        className={`badge ${on ? 'badge--success' : 'badge--muted'}`}
                        style={{ cursor: 'pointer', border: 'none', minWidth: 32, padding: '8px 0', fontSize: '.9rem' }}>
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="button button--primary" type="button" disabled={savingFields} onClick={saveFields}>
                  {savingFields ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'שמור'}
                </button>
              </div>
            </div>

            {/* Appliance / oven photos with a note each */}
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 8 }}>תמונות תנורים ומכשירי חשמל</div>
              {procPhotos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 12 }}>
                  {procPhotos.map(p => (
                    <div key={p.id} className="card" style={{ margin: 0, padding: 8 }}>
                      <div style={{ position: 'relative' }}>
                        {p.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
                        )}
                        <button type="button" title="מחק תמונה" onClick={() => deletePhoto(p.id)}
                          style={{ position: 'absolute', top: 6, insetInlineEnd: 6, background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <X size={15} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                        <input
                          value={noteEdits[`photo-${p.id}`] ?? (p.note ?? '')}
                          onChange={e => setNoteEdits(prev => ({ ...prev, [`photo-${p.id}`]: e.target.value }))}
                          placeholder="הערה לתמונה..."
                          style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: '.8rem' }} />
                        {noteEdits[`photo-${p.id}`] !== undefined && noteEdits[`photo-${p.id}`] !== (p.note ?? '') && (
                          <button className="button button--primary button--sm" style={{ padding: '4px 8px', fontSize: '.72rem' }} onClick={() => savePhotoNote(p.id)}>שמור</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <input value={newPhotoNote} onChange={e => setNewPhotoNote(e.target.value)} placeholder="הערה (אופציונלי) לתמונה הבאה"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 10px', fontSize: '.82rem', marginBottom: 8 }} />
              <PhotoAddControl onFiles={uploadPhotos} uploading={uploadingPhoto} remaining={20 - procPhotos.length} />
            </div>

            {/* Procedure checks: tick which checks apply at this location (+ note). */}
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 4 }}>בדיקות כשרות לנוהל</div>
              <p style={{ fontSize: '.76rem', color: 'var(--muted)', margin: '0 0 8px' }}>סמן את הבדיקות הרלוונטיות למקום זה.</p>
              {checklistItems.length === 0 ? <p className="textSm textMuted">אין פריטי בדיקה למקום זה.</p> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checklistItems.map(item => {
                  const row = tickedChecks[item.id]
                  const checked = !!row
                  return (
                    <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.86rem' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCheck(item.id)} style={{ accentColor: 'var(--primary)' }} />
                        {item.name}
                        <span className="badge badge--muted" style={{ fontSize: '.66rem' }}>{item.frequency === 'weekly' ? 'שבועי' : 'יומי'}</span>
                      </label>
                      {checked && (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginInlineStart: 26 }}>
                          <input
                            value={noteEdits[`check-${item.id}`] ?? (row.note ?? '')}
                            onChange={e => setNoteEdits(prev => ({ ...prev, [`check-${item.id}`]: e.target.value }))}
                            placeholder="הערת נוהל (אופציונלי)..."
                            style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: '.8rem' }} />
                          {noteEdits[`check-${item.id}`] !== undefined && noteEdits[`check-${item.id}`] !== (row.note ?? '') && (
                            <button className="button button--primary button--sm" style={{ padding: '4px 8px', fontSize: '.72rem' }} onClick={() => saveCheckNote(item.id)}>שמור</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>}
            </div>
          </div>
        </div>

        {/* Kashrus procedure (editable) */}
        <div className="card">
          <div className="card__header"><div className="card__title">נוהל כשרות</div></div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              value={kashrusProcedure}
              onChange={e => setKashrusProcedure(e.target.value)}
              placeholder="פרט את נוהל הכשרות למקום זה..."
              rows={5}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: '.88rem', lineHeight: 1.6, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="button button--primary" type="button" disabled={savingKashrus} onClick={saveKashrus}>
                {savingKashrus ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'שמור'}
              </button>
            </div>
            {location.kashrus_certificate_url && (
              <a href={location.kashrus_certificate_url} target="_blank" rel="noreferrer"
                className="button button--ghost button--sm">
                <ExternalLink size={13} /> תעודת כשרות
              </a>
            )}
          </div>
        </div>

        {/* Menu: text + photos/PDFs, editable by the assigned inspector */}
        <div className="card">
          <div className="card__header"><div className="card__title">תפריט</div></div>
          <div className="card__body">
            <MenuSection
              locationId={id}
              apiBase="/api/inspector/menu-files"
              initialText={location.menu_text}
              onSaveText={async text => {
                const res = await fetch('/api/inspector/procedure', {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ location_id: id, menu_text: text }),
                })
                return res.ok
              }}
            />
          </div>
        </div>

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

        {/* Location QR code (view + download) */}
        {location.qr_code && (
          <div className="card">
            <div className="card__header"><div className="card__title">קוד QR של המקום</div></div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!showQr ? (
                <button className="button button--ghost" onClick={() => setShowQr(true)}>
                  <QrCode size={16} /> הצג QR
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: 16, borderRadius: 'var(--radius)' }}>
                    <QRCodeSVG value={location.qr_code} size={200} level="M" />
                  </div>
                  <p className="textSm textMuted" style={{ textAlign: 'center', margin: 0 }}>הדפס ותלה במקום לסריקה</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="button button--ghost" style={{ flex: 1 }} onClick={downloadQr}>
                      <Download size={16} /> הורד QR (PNG)
                    </button>
                    <button className="button button--ghost" style={{ flex: 1 }} onClick={() => setShowQr(false)}>הסתר</button>
                  </div>
                  {/* Offscreen high-res canvas for the PNG download */}
                  <div ref={qrCanvasRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
                    <QRCodeCanvas value={location.qr_code} size={600} level="M" />
                  </div>
                </>
              )}
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
