'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckSquare } from 'lucide-react'
import Modal from '@/components/ui/Modal'

type Photo = { id: string; url: string | null; checklist_item_id: string | null; item_name: string | null; created_at: string }

// Photos of one visit (exit scan): general visit photos plus proof photos per
// checklist item, grouped under the item's name. Used by ReportsTab and the
// "בדיקות" tab of LocationDetailModal. `focusItemId` puts that item first.
export default function VisitPhotosModal({ visitLogId, focusItemId, onClose }: {
  visitLogId: string; focusItemId?: string | null; onClose: () => void
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/visit-photos?visit_log_id=${visitLogId}`)
      .then(r => r.json()).then(d => setPhotos(Array.isArray(d) ? d : []))
      .catch(() => setPhotos([]))
  }, [visitLogId])

  const groups: { key: string; title: string; proof: boolean; photos: Photo[] }[] = []
  for (const p of photos ?? []) {
    const key = p.checklist_item_id ?? 'general'
    let g = groups.find(x => x.key === key)
    if (!g) {
      g = { key, title: p.checklist_item_id ? (p.item_name ?? 'בדיקה שנמחקה') : 'תמונות כלליות', proof: !!p.checklist_item_id, photos: [] }
      groups.push(g)
    }
    g.photos.push(p)
  }
  groups.sort((a, b) => Number(b.key === focusItemId) - Number(a.key === focusItemId) || Number(b.proof) - Number(a.proof))

  return (
    <>
      <Modal open onClose={onClose} title="תמונות לביקור">
        {photos === null ? <div className="emptyState"><span className="spinner" /></div>
          : photos.length === 0 ? <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>אין תמונות לביקור זה.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groups.map(g => (
                <section key={g.key} data-testid={`photo-group-${g.key}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '.88rem', marginBottom: 8 }}>
                    {g.proof && <CheckSquare size={14} style={{ color: 'var(--success)' }} aria-hidden />}
                    {g.proof ? `הוכחה: ${g.title}` : g.title}
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({g.photos.length})</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                    {g.photos.map(p => p.url && (
                      <button key={p.id} type="button" onClick={() => setLightbox(p.url)} aria-label="הגדל תמונה"
                        style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--border)', border: 'none', padding: 0, cursor: 'zoom-in' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={g.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
      </Modal>

      {lightbox && typeof document !== 'undefined' && createPortal(
        <div role="dialog" aria-label="תמונה מוגדלת" onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
          <button aria-label="סגור" style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={28} />
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
