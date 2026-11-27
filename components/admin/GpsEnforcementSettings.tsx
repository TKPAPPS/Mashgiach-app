'use client'
import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { GpsEnforcement } from '@/lib/supabase/types'

const OPTIONS: { id: GpsEnforcement; label: string; help: string }[] = [
  { id: 'off',   label: 'כבוי',  help: 'הסריקה נרשמת כרגיל. התראה רק על סריקה רחוקה.' },
  { id: 'warn',  label: 'אזהרה', help: 'הסריקה נרשמת ומסומנת, והמשגיח מקבל אזהרה להפעיל מיקום.' },
  { id: 'block', label: 'חסימה', help: 'סריקה בלי מיקום, עם מיקום לא מדויק או רחוק מ-100 מטר נדחית. המשגיח יכול לשלוח בקשת תיקון.' },
]

export default function GpsEnforcementSettings() {
  const { toast } = useToast()
  const [mode, setMode] = useState<GpsEnforcement | null>(null)
  const [saving, setSaving] = useState(false)
  const [checkin, setCheckin] = useState<boolean | null>(null)
  const touched = useRef(false) // a late initial load must not override the admin's choice

  useEffect(() => {
    fetch('/api/admin/gps-settings').then(r => r.json())
      .then(j => { if (!touched.current) { setMode(j.gps_enforcement ?? 'warn'); setCheckin(j.location_checkin_enabled !== false) } })
      .catch(() => { if (!touched.current) { setMode('warn'); setCheckin(true) } })
  }, [])

  async function choose(next: GpsEnforcement) {
    if (next === mode || saving) return
    touched.current = true
    const prev = mode
    setMode(next) // optimistic; reverted below if the save fails
    setSaving(true)
    const res = await fetch('/api/admin/gps-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gps_enforcement: next }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) toast('הגדרת אימות המיקום נשמרה', 'success')
    else { setMode(prev); toast(j.error ?? 'שגיאה בשמירה', 'error') }
    setSaving(false)
  }

  async function toggleCheckin(next: boolean) {
    if (saving) return
    touched.current = true
    setCheckin(next)
    setSaving(true)
    const res = await fetch('/api/admin/gps-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location_checkin_enabled: next }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) toast(next ? 'כניסה במיקום הופעלה' : 'כניסה במיקום כובתה', 'success')
    else { setCheckin(!next); toast(j.error ?? 'שגיאה בשמירה', 'error') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card__header--inline">
        <div className="card__title"><MapPin size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />אימות מיקום בסריקה</div>
      </div>
      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === null ? <div className="emptyState"><span className="spinner" /></div> : OPTIONS.map(o => (
          <label key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: saving ? 'wait' : 'pointer' }}>
            <input type="radio" name="gps_enforcement" checked={mode === o.id} disabled={saving} onChange={() => choose(o.id)} style={{ marginTop: 4 }} />
            <span>
              <span style={{ fontWeight: 600 }}>{o.label}</span>
              <span style={{ display: 'block', fontSize: '.82rem', color: 'var(--muted)' }}>{o.help}</span>
            </span>
          </label>
        ))}
        {checkin !== null && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: saving ? 'wait' : 'pointer', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <input type="checkbox" checked={checkin} disabled={saving} onChange={e => toggleCheckin(e.target.checked)} style={{ marginTop: 4 }}
              aria-label="אפשר כניסה ויציאה במיקום" />
            <span>
              <span style={{ fontWeight: 600 }}>אפשר כניסה ויציאה במיקום (בלי QR)</span>
              <span style={{ display: 'block', fontSize: '.82rem', color: 'var(--muted)' }}>
                כפתור בדף המסעדה, למקרה שהקוד לא נסרק. נרשם רק עם מיקום עד 100 מטר מהמסעדה, בכל מצב. ביקורים כאלה מסומנים &quot;במיקום&quot;.
              </span>
            </span>
          </label>
        )}
      </div>
    </div>
  )
}
