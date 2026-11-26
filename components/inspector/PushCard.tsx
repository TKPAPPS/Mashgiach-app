'use client'
import { useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { readPushState, enablePush, disablePush, type PushState } from '@/lib/utils/pushClient'

// Inspector profile: turn phone notifications on (needed for the forgot-exit
// reminder). On iPhone, web push works only once the app is on the home screen.
export default function PushCard() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => { readPushState().then(setState) }, [])

  async function turnOn() {
    setBusy(true); setError(false)
    const next = await enablePush()
    if (next === 'error') setError(true)
    else setState(next)
    setBusy(false)
  }

  async function turnOff() {
    setBusy(true); setError(false)
    setState(await disablePush())
    setBusy(false)
  }

  const box = { width: '100%', marginTop: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'start' as const, display: 'flex', flexDirection: 'column' as const, gap: 8 }
  const help = { margin: 0, fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.5 }

  return (
    <div style={box} data-testid="push-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        {state === 'on' ? <Bell size={16} style={{ color: 'var(--success)' }} /> : <BellOff size={16} style={{ color: 'var(--muted)' }} />}
        התראות לטלפון
        {state === 'on' && <span style={{ marginInlineStart: 'auto', fontSize: '.78rem', color: 'var(--success)' }}>פעילות</span>}
      </div>

      {state === 'loading' && <span className="spinner" style={{ width: 16, height: 16 }} />}

      {state === 'off' && <>
        <p style={help}>קבל תזכורת אם שכחת לסרוק יציאה ממקום.</p>
        <button className="button button--primary" onClick={turnOn} disabled={busy}>
          {busy ? <span className="spinner" /> : 'הפעל התראות'}
        </button>
      </>}

      {state === 'on' && <>
        <p style={help}>תקבל תזכורת אם שכחת לסרוק יציאה ממקום.</p>
        <button className="button button--ghost button--sm" onClick={turnOff} disabled={busy} style={{ alignSelf: 'flex-start' }}>
          {busy ? <span className="spinner" /> : 'כבה התראות'}
        </button>
      </>}

      {state === 'ios_needs_install' && (
        <p style={help}>
          באייפון התראות עובדות רק כשהאפליקציה מותקנת במסך הבית: בספארי לחץ על <Share size={13} style={{ verticalAlign: '-2px' }} aria-label="שיתוף" /> ואז &quot;הוסף למסך הבית&quot;, פתח את האפליקציה מהאייקון וחזור לכאן.
        </p>
      )}

      {state === 'denied' && (
        <p style={help}>ההתראות חסומות בטלפון. כדי לאפשר אותן, פתח את הגדרות הטלפון או הדפדפן, אפשר התראות לאתר הזה וחזור לכאן.</p>
      )}

      {state === 'unsupported' && <p style={help}>הדפדפן הזה לא תומך בהתראות. נסה בכרום (אנדרואיד) או מהאפליקציה במסך הבית (אייפון).</p>}

      {error && <p style={{ ...help, color: 'var(--danger)' }}>ההפעלה נכשלה. נסה שוב.</p>}
    </div>
  )
}
