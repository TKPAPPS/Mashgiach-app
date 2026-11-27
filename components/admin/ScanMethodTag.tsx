import { MapPin } from 'lucide-react'

// "במיקום" next to the action when the visit was recorded with the location
// button (no QR). Nothing for a QR scan.
export default function ScanMethodTag({ method }: { method?: string | null }) {
  if (method !== 'gps') return null
  return (
    <span className="badge badge--info" title="נרשם בכפתור כניסה במיקום, בלי סריקת QR" data-testid="scan-method-gps"
      style={{ marginInlineStart: 6, fontSize: '.7rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <MapPin size={10} aria-hidden /> במיקום
    </span>
  )
}
