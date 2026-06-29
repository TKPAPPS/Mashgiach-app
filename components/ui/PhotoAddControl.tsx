'use client'
import { useRef } from 'react'
import { Camera, Image as ImageIcon } from 'lucide-react'

// Two-button photo picker: one opens the camera directly (capture=environment),
// the other opens the gallery/file picker (no capture). Both hand the selected
// FileList to onFiles. Shared by the inspector visit/report/location uploaders.
export default function PhotoAddControl({
  onFiles,
  uploading,
  remaining,
}: {
  onFiles: (files: FileList | null) => void
  uploading: boolean
  remaining: number
}) {
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="button button--ghost" style={{ gap: 8, flex: 1 }}
          disabled={uploading} onClick={() => camRef.current?.click()}>
          {uploading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Camera size={16} />}
          {uploading ? 'מעלה...' : 'צלם'}
        </button>
        <button type="button" className="button button--ghost" style={{ gap: 8, flex: 1 }}
          disabled={uploading} onClick={() => galRef.current?.click()}>
          <ImageIcon size={16} /> מהגלריה
        </button>
      </div>
      <span style={{ fontSize: '.74rem', color: 'var(--muted)', textAlign: 'center' }}>{remaining} נותרו</span>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
        onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
      <input ref={galRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}
