'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// Require at least one proof photo (tied to a checklist item) in every visit
// that has ticked checks. report_settings.require_proof_photo via
// /api/admin/gps-settings; enforced by /api/inspector/exit-form.
export default function ProofPhotoSettings() {
  const { toast } = useToast()
  const [on, setOn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    fetch('/api/admin/gps-settings').then(r => r.json())
      .then(j => { if (!touched.current) setOn(j.require_proof_photo === true) })
      .catch(() => { if (!touched.current) setOn(false) })
  }, [])

  async function toggle(next: boolean) {
    if (saving) return
    touched.current = true
    setOn(next); setSaving(true)
    const res = await fetch('/api/admin/gps-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ require_proof_photo: next }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) toast(next ? 'צילום הוכחה הוא עכשיו חובה' : 'צילום הוכחה כבר לא חובה', 'success')
    else { setOn(!next); toast(j.error ?? 'שגיאה בשמירה', 'error') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card__header--inline">
        <div className="card__title"><Camera size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />הוכחת תמונה בבדיקות</div>
      </div>
      <div style={{ padding: '4px 14px 16px' }}>
        {on === null ? <div className="emptyState"><span className="spinner" /></div> : (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: saving ? 'wait' : 'pointer' }}>
            <input type="checkbox" checked={on} disabled={saving} onChange={e => toggle(e.target.checked)} style={{ marginTop: 4 }}
              aria-label="חובה לצלם לפחות בדיקה אחת בכל ביקור" />
            <span>
              <span style={{ fontWeight: 600 }}>חובה לצלם לפחות בדיקה אחת בכל ביקור</span>
              <span style={{ display: 'block', fontSize: '.82rem', color: 'var(--muted)' }}>
                בסיום ביקור עם בדיקות, המשגיח צריך לצלם הוכחה לפחות לבדיקה אחת. אם המצלמה לא עובדת הוא כותב למה, והביקור מסומן &quot;ללא תמונה&quot; בלוגי הביקורים ובדוח היומי.
              </span>
            </span>
          </label>
        )}
      </div>
    </div>
  )
}
