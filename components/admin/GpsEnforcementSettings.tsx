'use client'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    fetch('/api/admin/gps-settings').then(r => r.json()).then(j => setMode(j.gps_enforcement ?? 'warn')).catch(() => setMode('warn'))
  }, [])

  async function choose(next: GpsEnforcement) {
    if (next === mode || saving) return
    setSaving(true)
    const res = await fetch('/api/admin/gps-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gps_enforcement: next }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) { setMode(next); toast('הגדרת אימות המיקום נשמרה', 'success') }
    else toast(j.error ?? 'שגיאה בשמירה', 'error')
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
      </div>
    </div>
  )
}
