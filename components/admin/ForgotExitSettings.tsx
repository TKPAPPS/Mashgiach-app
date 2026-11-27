'use client'
import { useEffect, useRef, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { FORGOT_EXIT_OPTIONS, forgotExitLabel } from '@/lib/utils/forgotExit'
import { AUTO_CLOSE_OPTIONS, autoCloseLabel, reminderFitsAutoClose } from '@/lib/utils/autoClose'

// An inspector who scanned in and never scanned out: when to push a reminder
// (report_settings.forgot_exit_minutes) and when to close the visit on its own
// (report_settings.auto_close_hours). Saved via /api/admin/gps-settings; both
// run in /api/cron/forgot-exit (cron-job.org, every 15 minutes).
export default function ForgotExitSettings() {
  const { toast } = useToast()
  const [minutes, setMinutes] = useState<number | null>(null)
  const [hours, setHours] = useState<number | null>(null)
  const [push, setPush] = useState<{ with: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    fetch('/api/admin/gps-settings').then(r => r.json()).then(j => {
      if (!touched.current) { setMinutes(j.forgot_exit_minutes ?? 240); setHours(j.auto_close_hours ?? 12) }
      if (typeof j.inspectors_total === 'number') setPush({ with: j.inspectors_with_push ?? 0, total: j.inspectors_total })
    }).catch(() => { if (!touched.current) { setMinutes(240); setHours(12) } })
  }, [])

  async function save(field: 'forgot_exit_minutes' | 'auto_close_hours', next: number) {
    const prev = field === 'forgot_exit_minutes' ? minutes : hours
    if (next === prev || saving) return
    touched.current = true
    const set = field === 'forgot_exit_minutes' ? setMinutes : setHours
    set(next)
    setSaving(true)
    const res = await fetch('/api/admin/gps-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: next }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) toast(field === 'forgot_exit_minutes' ? 'הגדרת התזכורת נשמרה' : 'הגדרת הסגירה האוטומטית נשמרה', 'success')
    else { set(prev); toast(j.error ?? 'שגיאה בשמירה', 'error') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card__header--inline">
        <div className="card__title"><BellRing size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />ביקור שלא נסרקה בו יציאה</div>
      </div>
      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted)' }}>
          קודם המשגיח מקבל תזכורת לטלפון. אם גם אחרי זמן הסגירה לא נסרקה יציאה, הביקור נסגר אוטומטית, מסומן &quot;נסגר אוטומטית&quot; ולא נספר לו זמן. ביקור כזה מופיע בדוח היומי, והמשגיח יכול לשלוח בקשת תיקון.
        </p>
        {minutes === null || hours === null ? <div className="emptyState"><span className="spinner" /></div> : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 200px', maxWidth: 260 }}>
              <span>לשלוח תזכורת</span>
              <select value={minutes} disabled={saving} onChange={e => save('forgot_exit_minutes', Number(e.target.value))} aria-label="זמן התזכורת">
                {FORGOT_EXIT_OPTIONS.map(m => <option key={m} value={m} disabled={!reminderFitsAutoClose(m, hours)}>{forgotExitLabel(m)}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 200px', maxWidth: 260 }}>
              <span>לסגור את הביקור אוטומטית</span>
              <select value={hours} disabled={saving} onChange={e => save('auto_close_hours', Number(e.target.value))} aria-label="זמן הסגירה האוטומטית">
                {AUTO_CLOSE_OPTIONS.map(h => <option key={h} value={h} disabled={!reminderFitsAutoClose(minutes, h)}>{autoCloseLabel(h)}</option>)}
              </select>
            </label>
          </div>
        )}
        {push && (
          <p style={{ margin: 0, fontSize: '.82rem', color: push.with < push.total ? 'var(--warning)' : 'var(--muted)' }}>
            {push.with} מתוך {push.total} משגיחים הפעילו התראות בטלפון. רק הם יקבלו את התזכורת (הפעלה: לשונית פרופיל באפליקציית המשגיח).
          </p>
        )}
      </div>
    </div>
  )
}
