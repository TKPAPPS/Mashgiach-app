'use client'
import { useEffect, useState } from 'react'
import { Bell, Share } from 'lucide-react'
import { readPushState, enablePush, type PushState } from '@/lib/utils/pushClient'
import { useToast } from '@/components/ui/Toast'

const SNOOZE_KEY = 'pushPromptSnoozedUntil'
const SNOOZE_MS = 3 * 24 * 3600_000

// Top of the inspector home screen while phone notifications are off: one line
// on why, and the button. A phone only shows its permission question after a
// tap, so this cannot ask on its own. "לא עכשיו" hides it for 3 days. The
// profile tab card (PushCard) stays the place to turn it off again.
export default function PushPrompt() {
  const { toast } = useToast()
  const [state, setState] = useState<PushState | 'hidden'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    readPushState().then(st => {
      let snoozed = false
      try { snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now() } catch {}
      setState(snoozed ? 'hidden' : st)
    })
  }, [])

  function later() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)) } catch {}
    setState('hidden')
  }

  async function turnOn() {
    setBusy(true)
    const next = await enablePush()
    setBusy(false)
    if (next === 'on') { setState('hidden'); toast('התראות הופעלו', 'success'); return }
    if (next === 'error') { toast('ההפעלה נכשלה. נסה שוב.', 'error'); return }
    setState(next)
  }

  if (state !== 'off' && state !== 'ios_needs_install' && state !== 'denied') return null

  return (
    <div data-testid="push-prompt" role="region" aria-label="הפעלת התראות"
      style={{ border: '1px solid var(--gold)', background: 'var(--gold-light)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
        <Bell size={17} aria-hidden /> הפעל התראות בטלפון
      </div>

      {state === 'off' && (
        <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.55 }}>
          כך תקבל תזכורת אם שכחת לסרוק יציאה, לפני שהביקור נשאר פתוח.
        </p>
      )}
      {state === 'ios_needs_install' && (
        <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.55 }}>
          באייפון התראות עובדות רק מהאפליקציה במסך הבית: בספארי לחץ על <Share size={13} style={{ verticalAlign: '-2px' }} aria-label="שיתוף" /> ואז &quot;הוסף למסך הבית&quot;, ופתח את האפליקציה מהאייקון.
        </p>
      )}
      {state === 'denied' && (
        <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.55 }}>
          ההתראות חסומות בטלפון, אז תזכורת היציאה לא תגיע. פתח את הגדרות הטלפון, אפשר התראות לאתר הזה וחזור לכאן.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {state === 'off' && (
          <button className="button button--primary" onClick={turnOn} disabled={busy} style={{ flex: 1 }}>
            {busy ? <span className="spinner" /> : 'הפעל התראות'}
          </button>
        )}
        <button className="button button--ghost" onClick={later} disabled={busy} style={state === 'off' ? undefined : { flex: 1 }}>לא עכשיו</button>
      </div>
    </div>
  )
}
