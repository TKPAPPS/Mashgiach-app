'use client'
import { useState, useEffect } from 'react'
import { Mail, Send } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { ReportSection } from '@/lib/supabase/types'

const SECTION_OPTIONS: { id: ReportSection; label: string }[] = [
  { id: 'time_per_restaurant', label: 'פעילות לפי משגיח ומסעדה' },
  { id: 'deficiencies',        label: 'ליקויי כשרות והערות' },
  { id: 'checklist_details',   label: 'פירוט בדיקות שבוצעו' },
  { id: 'gps_alerts',          label: 'חריגות מיקום (GPS)' },
  { id: 'open_visits',         label: 'ביקורים שלא נסגרו' },
  { id: 'certificate_expiry',  label: 'תעודות כשרות שפוקעות' },
]

// Same section keys, but the monthly report renders the checklist as an
// aggregate summary rather than full per-visit detail.
const MONTHLY_SECTION_OPTIONS: { id: ReportSection; label: string }[] = [
  { id: 'time_per_restaurant', label: 'פעילות לפי משגיח ומסעדה' },
  { id: 'deficiencies',        label: 'ליקויי כשרות והערות' },
  { id: 'checklist_details',   label: 'סיכום בדיקות לפי מסעדה' },
  { id: 'gps_alerts',          label: 'סיכום חריגות מיקום (GPS) לפי משגיח' },
  { id: 'open_visits',         label: 'ביקורים שלא נסגרו לפי משגיח' },
]

export default function ReportSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [sendTime, setSendTime] = useState('10:00')
  const [recipients, setRecipients] = useState('')
  const [sections, setSections] = useState<Set<ReportSection>>(new Set())
  const [monthlyEnabled, setMonthlyEnabled] = useState(false)
  const [monthlySections, setMonthlySections] = useState<Set<ReportSection>>(new Set())
  const [monthlyTesting, setMonthlyTesting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/report-settings')
      const { settings } = await res.json()
      if (settings) {
        setEnabled(!!settings.enabled)
        setSendTime(settings.send_time ?? '10:00')
        setRecipients((settings.recipients ?? []).join('\n'))
        setSections(new Set((settings.sections ?? []) as ReportSection[]))
        setMonthlyEnabled(!!settings.monthly_enabled)
        setMonthlySections(new Set((settings.monthly_sections ?? []) as ReportSection[]))
      }
    } catch { /* leave defaults */ }
    setLoading(false)
  }

  function parseRecipients(): string[] {
    return [...new Set(recipients.split(/[\n,]+/).map(r => r.trim()).filter(Boolean))]
  }

  function toggleSection(id: ReportSection) {
    setSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleMonthlySection(id: ReportSection) {
    setMonthlySections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/admin/report-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled, send_time: sendTime, recipients: parseRecipients(), sections: [...sections],
        monthly_enabled: monthlyEnabled, monthly_sections: [...monthlySections],
      }),
    })
    const json = await res.json()
    if (!res.ok) toast(json.error ?? 'שגיאה בשמירה', 'error')
    else { toast('הגדרות הדוח נשמרו', 'success'); load() }
    setSaving(false)
  }

  async function sendTest() {
    setTesting(true)
    const res = await fetch('/api/admin/report-settings/test', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) toast(json.error ?? 'שגיאה בשליחה', 'error')
    else toast(`נשלח דוח לדוגמה ל-${json.sent_to} נמענים`, 'success')
    setTesting(false)
  }

  async function sendMonthlyTest() {
    setMonthlyTesting(true)
    const res = await fetch('/api/admin/report-settings/monthly-test', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) toast(json.error ?? 'שגיאה בשליחה', 'error')
    else toast(`נשלח דוח חודשי לדוגמה ל-${json.sent_to} נמענים`, 'success')
    setMonthlyTesting(false)
  }

  return (
    <>
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card__header--inline">
        <div className="card__title"><Mail size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />דוח יומי למנהל</div>
      </div>
      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> : <>
          <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: 0 }}>
            דוח אוטומטי הנשלח במייל בכל בוקר, ומסכם את פעילות היום הקודם (שעון בנגקוק).
          </p>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.9rem', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            הפעל שליחת דוח יומי
          </label>

          <div className="fieldRow">
            <label className="field"><span>שעת שליחה (בנגקוק)</span>
              <input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} />
            </label>
            <div />
          </div>

          <label className="field">
            <span>נמענים (כתובת מייל בכל שורה)</span>
            <textarea rows={3} value={recipients} onChange={e => setRecipients(e.target.value)}
              placeholder={'manager@example.com\nowner@example.com'}
              style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '.85rem' }} />
          </label>

          <div>
            <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>תוכן הדוח</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {SECTION_OPTIONS.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={sections.has(s.id)} onChange={() => toggleSection(s.id)} style={{ width: 'auto', flex: '0 0 auto', margin: 0 }} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button button--primary button--sm" onClick={save} disabled={saving}>
              {saving ? <span className="spinner" /> : 'שמור'}
            </button>
            <button className="button button--ghost button--sm" onClick={sendTest} disabled={testing}>
              {testing ? <span className="spinner" /> : <><Send size={14} /> שלח דוח לדוגמה עכשיו</>}
            </button>
          </div>

          <p style={{ fontSize: '.74rem', color: 'var(--muted)', margin: 0, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            התזמון מופעל על ידי שירות חיצוני (cron) הקורא לכתובת ייעודית מדי שעה. פרטי ההגדרה נמסרים בנפרד.
          </p>
        </>}
      </div>
    </div>

    <div className="card" style={{ marginTop: 16 }}>
      <div className="card__header--inline">
        <div className="card__title"><Mail size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />דוח חודשי למנהל</div>
      </div>
      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> : <>
          <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: 0 }}>
            דוח מסכם הנשלח אוטומטית ב-1 בכל חודש בשעה 09:00 (שעון בנגקוק), ומסכם את פעילות החודש הקודם. נשלח לאותם נמענים של הדוח היומי.
          </p>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.9rem', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={monthlyEnabled} onChange={e => setMonthlyEnabled(e.target.checked)} />
            הפעל שליחת דוח חודשי
          </label>

          <div>
            <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>תוכן הדוח</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {MONTHLY_SECTION_OPTIONS.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={monthlySections.has(s.id)} onChange={() => toggleMonthlySection(s.id)} style={{ width: 'auto', flex: '0 0 auto', margin: 0 }} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button button--primary button--sm" onClick={save} disabled={saving}>
              {saving ? <span className="spinner" /> : 'שמור'}
            </button>
            <button className="button button--ghost button--sm" onClick={sendMonthlyTest} disabled={monthlyTesting}>
              {monthlyTesting ? <span className="spinner" /> : <><Send size={14} /> שלח דוח חודשי לדוגמה עכשיו</>}
            </button>
          </div>

          <p style={{ fontSize: '.74rem', color: 'var(--muted)', margin: 0, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            הנמענים משותפים עם הדוח היומי (נערכים בכרטיס למעלה). התזמון מופעל על ידי שירות חיצוני (cron) הקורא לכתובת ייעודית מדי שעה.
          </p>
        </>}
      </div>
    </div>
    </>
  )
}
