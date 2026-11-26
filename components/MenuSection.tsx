'use client'
import { useEffect, useRef, useState } from 'react'
import { FileText, X, Paperclip } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PhotoAddControl from '@/components/ui/PhotoAddControl'
import { useToast } from '@/components/ui/Toast'
import { toJpegFile } from '@/lib/utils/image'

type MenuFile = { id: string; file_name: string | null; mime: string; url: string | null }
const MAX_FILES = 20

// Restaurant menu: free text plus photos/PDFs. Shared by the admin location modal
// and the inspector location page; they differ only in the files API they call
// and in how the text is saved. initialText is read once: parents remount it
// with a key when the location data arrives (see LocationDetailModal).
export default function MenuSection({
  locationId,
  apiBase,
  initialText,
  onSaveText,
}: {
  locationId: string
  apiBase: '/api/admin/menu-files' | '/api/inspector/menu-files'
  initialText: string | null | undefined
  onSaveText: (text: string) => Promise<boolean>
}) {
  const { toast } = useToast()
  const [text, setText] = useState(initialText ?? '')
  const [saved, setSaved] = useState(initialText ?? '')
  const [savingText, setSavingText] = useState(false)
  const [files, setFiles] = useState<MenuFile[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MenuFile | null>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${apiBase}?location_id=${locationId}`).then(r => r.ok ? r.json() : []).then(setFiles).catch(() => setFiles([]))
  }, [apiBase, locationId])

  async function saveText() {
    setSavingText(true)
    const ok = await onSaveText(text.trim())
    setSavingText(false)
    if (ok) { setSaved(text.trim()); toast('התפריט נשמר', 'success') }
    else toast('שגיאה בשמירה', 'error')
  }

  async function upload(list: FileList | null, kind: 'image' | 'pdf') {
    if (!list || list.length === 0) return
    const room = MAX_FILES - (files?.length ?? 0)
    const picked = Array.from(list).slice(0, Math.max(0, room))
    if (picked.length === 0) { toast(`ניתן לשמור עד ${MAX_FILES} קבצים`, 'error'); return }
    setUploading(true)
    for (const f of picked) {
      const file = kind === 'image' ? await toJpegFile(f, 2400) : f
      const fd = new FormData()
      fd.append('location_id', locationId)
      fd.append('file', file)
      const res = await fetch(apiBase, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setFiles(prev => [...(prev ?? []), j as MenuFile])
      else toast(j.error ?? 'שגיאה בהעלאה', 'error')
    }
    setUploading(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const res = await fetch(`${apiBase}?id=${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) setFiles(prev => (prev ?? []).filter(f => f.id !== deleteTarget.id))
    else toast('שגיאה במחיקה', 'error')
    setDeleteTarget(null)
  }

  const dirty = text.trim() !== saved
  const images = (files ?? []).filter(f => f.mime.startsWith('image/'))
  const pdfs = (files ?? []).filter(f => f.mime === 'application/pdf')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label className="field">
        <span>תפריט (טקסט)</span>
        <textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="מנות, מרכיבים, ספקים או כל מידע שהמשגיח צריך לדעת" />
      </label>
      {dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="button button--primary" disabled={savingText} onClick={saveText}>
            {savingText ? <span className="spinner" /> : 'שמור תפריט'}
          </button>
        </div>
      )}

      <div className="field">
        <span>קבצי תפריט (תמונות ו-PDF)</span>
        {files === null ? <div className="emptyState"><span className="spinner" /></div> : (
          <>
            {files.length === 0 && <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '2px 0 6px' }}>עדיין לא הועלו קבצים.</p>}
            {images.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                {images.map(f => (
                  <div key={f.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" aria-label={`פתח ${f.file_name ?? 'תמונה'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.file_name ?? 'תמונת תפריט'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    )}
                    <button type="button" aria-label="מחק תמונה" onClick={() => setDeleteTarget(f)}
                      style={{ position: 'absolute', top: 4, insetInlineEnd: 4, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pdfs.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pdfs.map(f => (
                  <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px' }}>
                    <FileText size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} aria-hidden />
                    {f.url
                      ? <a href={f.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name ?? 'תפריט.pdf'}</a>
                      : <span style={{ flex: 1 }}>{f.file_name}</span>}
                    <button type="button" className="button button--icon button--ghost" aria-label="מחק קובץ" onClick={() => setDeleteTarget(f)}><X size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
            {files.length < MAX_FILES && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <PhotoAddControl onFiles={l => upload(l, 'image')} uploading={uploading} remaining={MAX_FILES - files.length} />
                <button type="button" className="button button--ghost" disabled={uploading} onClick={() => pdfRef.current?.click()} style={{ gap: 8 }}>
                  <Paperclip size={16} /> הוסף קובץ PDF
                </button>
                <input ref={pdfRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }}
                  onChange={e => { upload(e.target.files, 'pdf'); e.target.value = '' }} />
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="מחיקת קובץ תפריט"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteTarget(null)}>ביטול</button>
          <button className="button button--danger" onClick={confirmDelete}>מחק</button>
        </>}>
        <p>למחוק את &quot;{deleteTarget?.file_name ?? 'הקובץ'}&quot;? לא ניתן לשחזר.</p>
      </Modal>
    </div>
  )
}
