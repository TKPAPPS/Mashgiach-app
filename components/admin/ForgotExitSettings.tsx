'use client'
import { useEffect, useRef, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { FORGOT_EXIT_OPTIONS, forgotExitLabel } from '@/lib/utils/forgotExit'

// When to push an inspector who scanned in and never scanned out. Saved on
// report_settings.forgot_exit_minutes via /api/admin/gps-settings; the push is
// sent by /api/cron/forgot-exit (cron-job.org, every 15 minutes).
export default function ForgotExitSettings() {
  const { toast } = useToast()
  const [minutes, setMinutes] = useState<number | null>(null)
  const [push, setPush] = useState<{ with: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    fetch('/api/admin/gps-settings').then(r => r.json()).then(j => {
      if (!touched.current) setMinutes(j.forgot_exit_minutes ?? 240)
      if (typeof j.inspectors_total === 'number') setPush({ with: j.inspectors_with_push ?? 0, total: j.inspectors_total })
    }).catch(() => { if (!touched.current) setMinutes(240) })
  }, [])

  async function choose(next: number) {
    if (next === minutes || saving) return
    touched.current = true
    const prev = minutes
    setMinutes(next)
    setSaving(true)
    const res = await fetch('/api/admin/gps-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forgot_exit_minutes: next }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) toast('הגדרת התזכורת נשמרה', 'success')
    else { setMinutes(prev); toast(j.error ?? 'שגיאה בשמירה', 'error') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card__header--inline">
        <div className="card__title"><BellRing size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />תזכורת למשגיח ששכח לסרוק יציאה</div>
      </div>
      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted)' }}>
          המשגיח מקבל התראה אחת לטלפון אם עבר הזמן הזה מהכניסה ועדיין לא נסרקה יציאה.
        </p>
        {minutes === null ? <div className="emptyState"><span className="spinner" /></div> : (
          <label className="field" style={{ maxWidth: 260 }}>
            <span>לשלוח תזכורת</span>
            <select value={minutes} disabled={saving} onChange={e => choose(Number(e.target.value))} aria-label="זמן התזכורת">
              {FORGOT_EXIT_OPTIONS.map(m => <option key={m} value={m}>{forgotExitLabel(m)}</option>)}
            </select>
          </label>
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
