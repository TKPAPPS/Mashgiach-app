'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, CheckCircle, AlertTriangle, Trash2, Camera } from 'lucide-react'
import PhotoAddControl from '@/components/ui/PhotoAddControl'
import { toJpegFile } from '@/lib/utils/image'
import type { ChecklistItem } from '@/lib/supabase/types'

type VisitPhoto = { id: string; url: string | null; checklist_item_id?: string | null }
const MAX_ITEM_PHOTOS = 3

// Proof photo for one ticked checklist item: camera only (a live photo, not the
// gallery), up to 3 per item, stored in visit_photos with checklist_item_id.
function ItemProof({ visitLogId, itemId, itemName, photos, onChange }: {
  visitLogId: string; itemId: string; itemName: string
  photos: VisitPhoto[]; onChange: (next: VisitPhoto[]) => void
}) {
  const camRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true); setError('')
    let next = photos
    for (const file of Array.from(files).slice(0, MAX_ITEM_PHOTOS - photos.length)) {
      const fd = new FormData()
      fd.append('visit_log_id', visitLogId)
      fd.append('checklist_item_id', itemId)
      fd.append('file', await toJpegFile(file))
      const res = await fetch('/api/inspector/visit-photos', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { next = [...next, j as VisitPhoto]; onChange(next) }
      else { setError(j.message ?? 'העלאת התמונה נכשלה'); break }
    }
    setUploading(false)
  }

  async function remove(id: string) {
    const res = await fetch(`/api/inspector/visit-photos?id=${id}`, { method: 'DELETE' })
    if (res.ok) onChange(photos.filter(p => p.id !== id))
  }

  return (
    <div style={{ marginRight: 26, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {photos.map(p => (
          <div key={p.id} style={{ position: 'relative', width: 52, height: 52, borderRadius: 6, overflow: 'hidden', background: 'var(--border)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.url && <img src={p.url} alt={`הוכחה: ${itemName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            <button type="button" onClick={() => remove(p.id)} aria-label="מחק תמונה"
              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 4, color: '#fff', width: 20, height: 20, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {photos.length < MAX_ITEM_PHOTOS && (
          <button type="button" className="button button--ghost button--sm" disabled={uploading}
            onClick={() => camRef.current?.click()} aria-label={`צלם הוכחה: ${itemName}`}
            style={{ gap: 6, height: photos.length ? 52 : undefined }}>
            {uploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Camera size={14} />}
            {uploading ? 'מעלה...' : photos.length ? 'עוד' : 'צלם הוכחה'}
          </button>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          data-testid={`proof-input-${itemId}`}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      </div>
      {error && <span style={{ fontSize: '.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

function PhotoUpload({ visitLogId, initial }: { visitLogId: string; initial: VisitPhoto[] }) {
  const [photos, setPhotos] = useState<VisitPhoto[]>(initial)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files) return
    const remaining = 10 - photos.length
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
    <div className="card">
      <div className="card__header"><div className="card__title">תמונות לביקור ({photos.length}/10)</div></div>
      <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {photos.map(p => (
              <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--border)' }}>
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <button onClick={() => handleDelete(p.id)}
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: 6, color: '#fff', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
    </div>
  )
}

type Phase =
  | 'loading'
  | 'no-params'
  | 'form'
  | 'confirm-empty'
  | 'confirm-skip'
  | 'success'
  | 'error'

function ChecklistInner() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = useRef(createClient()).current

  const visitLogId = params.get('visit_log_id')
  const locationId = params.get('location_id')
  const hasParams = !!visitLogId && !!locationId

  const [phase, setPhase] = useState<Phase>(hasParams ? 'loading' : 'no-params')
  const [submitting, setSubmitting] = useState(false)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [itemPhotos, setItemPhotos] = useState<Record<string, VisitPhoto[]>>({})
  const [generalPhotos, setGeneralPhotos] = useState<VisitPhoto[] | null>(null)

  useEffect(() => {
    if (!hasParams) return
    let cancelled = false
    ;(async () => {
      // Per-location list if this location has its own items; otherwise fall back
      // to the global default list (location_id IS NULL). Keeps behavior unchanged
      // for any location an admin has not customized yet.
      const { data: locItems } = await supabase
        .from('checklist_items').select('*')
        .eq('active', true).eq('location_id', locationId)
        .order('sort_order')
      let result = (locItems ?? []) as ChecklistItem[]
      if (result.length === 0) {
        const { data: globals } = await supabase
          .from('checklist_items').select('*')
          .eq('active', true).is('location_id', null)
          .order('sort_order')
        result = (globals ?? []) as ChecklistItem[]
      }
      // Photos already taken for this visit (e.g. after a reload).
      const existing: VisitPhoto[] = await fetch(`/api/inspector/visit-photos?visit_log_id=${visitLogId}`)
        .then(r => r.ok ? r.json() : []).catch(() => [])
      if (cancelled) return
      const byItem: Record<string, VisitPhoto[]> = {}
      for (const p of existing) if (p.checklist_item_id) (byItem[p.checklist_item_id] ??= []).push(p)
      setItemPhotos(byItem)
      setGeneralPhotos(existing.filter(p => !p.checklist_item_id))
      // An item with a proof photo was ticked before the reload.
      setChecked(new Set(Object.keys(byItem)))
      setItems(result)
      setPhase('form')
    })()
    return () => { cancelled = true }
  // hasParams is derived from URL params (stable after mount); supabase ref is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasParams])

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
      return next
    })
  }

  function setNote(id: string, value: string) {
    setNotes(prev => ({ ...prev, [id]: value }))
  }

  const dailyItems = items.filter(i => i.frequency !== 'weekly')
  const weeklyItems = items.filter(i => i.frequency === 'weekly')

  function renderItem(item: ChecklistItem) {
    const isChecked = checked.has(item.id)
    return (
      <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          className={`checkItem${isChecked ? ' checkItem--checked' : ''}`}
          onClick={() => toggleCheck(item.id)}
          style={{ cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleCheck(item.id)}
            onClick={e => e.stopPropagation()}
          />
          <span className="checkItem__label">{item.name}</span>
        </div>
        {isChecked && (
          <input
            type="text"
            placeholder="הערה (אופציונלי)"
            value={notes[item.id] ?? ''}
            onChange={e => setNote(item.id, e.target.value)}
            style={{
              marginRight: 26,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '5px 10px',
              fontSize: '.82rem',
              background: '#fff',
            }}
          />
        )}
        {(isChecked || (itemPhotos[item.id]?.length ?? 0) > 0) && visitLogId && (
          <ItemProof visitLogId={visitLogId} itemId={item.id} itemName={item.name}
            photos={itemPhotos[item.id] ?? []}
            onChange={next => setItemPhotos(prev => ({ ...prev, [item.id]: next }))} />
        )}
      </div>
    )
  }

  async function submit() {
    setSubmitting(true)
    const checks = items
      .filter(item => checked.has(item.id))
      .map(item => ({
        checklist_item_id: item.id,
        item_name: item.name,
        note: notes[item.id]?.trim() || null,
        frequency: item.frequency,
      }))

    const res = await fetch('/api/inspector/exit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_log_id: visitLogId, location_id: locationId, checks }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      setErrorMsg(data.error ?? 'שגיאה בשליחה')
      setSubmitting(false)
      setPhase('error')
    } else {
      setSubmitting(false)
      setPhase('success')
    }
  }

  function handleSubmitClick() {
    if (checked.size === 0) {
      setPhase('confirm-empty')
    } else {
      submit()
    }
  }

  if (phase === 'loading') {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (phase === 'no-params') {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        <AlertTriangle size={40} style={{ color: 'var(--warning)' }} />
        <p style={{ color: 'var(--muted)' }}>פרמטרים חסרים. חזור לעמוד הבית.</p>
        <button className="button button--primary" onClick={() => router.push('/inspector')}>חזור לבית</button>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20, textAlign: 'center' }}>
        <CheckCircle size={64} style={{ color: 'var(--success)' }} />
        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>הבדיקות נשמרו</div>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
          {checked.size > 0 ? `${checked.size} פריטים סומנו ונשמרו.` : 'הוגש ללא פריטים מסומנים.'}
        </p>
        <button className="button button--primary" style={{ width: '100%', maxWidth: 280 }}
          onClick={() => router.push('/inspector')}>
          חזור לבית
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', fontSize: '2.5rem' }}>✗</div>
        <div style={{ color: 'var(--danger)', fontWeight: 600 }}>שגיאה בשמירת הבדיקות</div>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>{errorMsg}</p>
        <button className="button button--ghost" onClick={() => router.push('/inspector')}>חזור לבית</button>
      </div>
    )
  }

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh' }}>
      <header className="appHeader">
        <button className="button button--icon button--ghost" style={{ color: '#fff', border: 'none' }}
          onClick={() => router.push('/inspector')}>
          <ArrowRight size={18} />
        </button>
        <div className="appHeader__title" style={{ flex: 1, textAlign: 'center' }}>רשימת בדיקות יציאה</div>
      </header>

      <div style={{ padding: '16px 14px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Inline confirmation: zero checked */}
        {phase === 'confirm-empty' && (
          <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--warning)' }}>
                <AlertTriangle size={16} />
                לא סומן אף פריט
              </div>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: 0 }}>
                האם להגיש את הרשימה ללא פריטים מסומנים?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button button--primary button--sm" onClick={submit}>כן, הגש בכל זאת</button>
                <button className="button button--ghost button--sm" onClick={() => setPhase('form')}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Inline confirmation: skip */}
        {phase === 'confirm-skip' && (
          <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 600, color: 'var(--warning)' }}>דילוג על רשימת הבדיקות</div>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: 0 }}>
                האם אתה בטוח שברצונך לדלג? הבדיקות לא יישמרו.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button button--danger button--sm" onClick={() => router.push('/inspector')}>כן, דלג</button>
                <button className="button button--ghost button--sm" onClick={() => setPhase('form')}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Checklist card */}
        {items.length === 0 ? (
          <div className="card">
            <div className="card__body">
              <p className="textMuted textSm" style={{ textAlign: 'center' }}>אין פריטים פעילים ברשימת הבדיקות.</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card__header">
              <div className="card__title">בדוק את הסעיפים שבוצעו</div>
            </div>
            <div className="card__body">
              {dailyItems.length > 0 && (
                <>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>בדיקות יומיות</div>
                  <div className="checklistWrap">
                    {dailyItems.map(renderItem)}
                  </div>
                </>
              )}
              {weeklyItems.length > 0 && (
                <>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--muted)', margin: `${dailyItems.length > 0 ? 16 : 0}px 0 8px` }}>בדיקות שבועיות</div>
                  <div className="checklistWrap">
                    {weeklyItems.map(renderItem)}
                  </div>
                </>
              )}
              <p style={{ marginTop: 12, fontSize: '.78rem', color: 'var(--muted)' }}>
                {checked.size} מתוך {items.length} פריטים סומנו
              </p>
            </div>
          </div>
        )}

        {/* Photo upload */}
        {(phase === 'form' || phase === 'confirm-empty' || phase === 'confirm-skip') && visitLogId && generalPhotos && (
          <PhotoUpload visitLogId={visitLogId} initial={generalPhotos} />
        )}

        {/* Actions */}
        {(phase === 'form' || phase === 'confirm-empty' || phase === 'confirm-skip') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="button button--primary"
              style={{ height: 50, fontSize: '1rem' }}
              onClick={handleSubmitClick}
            disabled={submitting}
            >
              {submitting ? <span className="spinner" /> : 'שמור בדיקות'}
            </button>
            <button
              className="button button--ghost"
              onClick={() => setPhase('confirm-skip')}
            >
              דלג על הבדיקות
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChecklistPage() {
  return (
    <Suspense fallback={
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    }>
      <ChecklistInner />
    </Suspense>
  )
}
