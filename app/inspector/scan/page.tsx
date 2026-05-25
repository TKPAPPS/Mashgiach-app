'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QrCode, CheckCircle, ArrowRight } from 'lucide-react'

type ScanResult = {
  success: boolean
  action_type?: string
  location_name?: string
  location_id?: string
  visit_log_id?: string
  message?: string
}

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const [qrCode, setQrCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    if (!qrCode.trim()) return
    setLoading(true)
    setGpsLoading(true)

    let lat: number | null = null
    let lng: number | null = null

    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 0 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {
      // GPS unavailable; server will handle accordingly
    }
    setGpsLoading(false)

    const res = await fetch('/api/inspector/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_code: qrCode.trim(), lat, lng }),
    })
    const data: ScanResult = await res.json()

    // After a successful exit scan, check whether active checklist items exist.
    // If they do, redirect to the checklist page instead of showing the result screen.
    if (data.success && data.action_type === 'exit' && data.visit_log_id && data.location_id) {
      const { count } = await supabase
        .from('checklist_items')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
      if (count && count > 0) {
        router.push(`/inspector/checklist?visit_log_id=${data.visit_log_id}&location_id=${data.location_id}`)
        return
      }
    }

    setResult(data)
    setLoading(false)
  }

  if (result) {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20, textAlign: 'center' }}>
          <CheckCircle size={64} style={{ color: 'var(--success)' }} />
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>
              {result.action_type === 'entry' ? 'כניסה' : 'יציאה'} בוצעה
            </div>
            {result.location_name && (
              <div style={{ color: 'var(--muted)', fontSize: '.95rem' }}>{result.location_name}</div>
            )}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', maxWidth: 280 }}>
            הפעולה נרשמה בהצלחה במערכת.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
            {result.action_type === 'entry' && (
              <button className="button button--primary" onClick={() => router.push('/inspector')}>
                המשך לרשימת בדיקות
              </button>
            )}
            <button className="button button--ghost" onClick={() => { setResult(null); setQrCode('') }}>
              סריקה נוספת
            </button>
            <button className="button button--ghost" onClick={() => router.push('/inspector')}>
              <ArrowRight size={15} /> חזור לבית
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh' }}>
      <header className="appHeader">
        <button className="button button--icon button--ghost" style={{ color: '#fff', border: 'none' }}
          onClick={() => router.push('/inspector')}>
          <ArrowRight size={18} />
        </button>
        <div className="appHeader__title" style={{ flex: 1, textAlign: 'center' }}>סריקת QR</div>
      </header>

      <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <QrCode size={64} style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
          <p>הזן את קוד ה-QR שמוצג במקום</p>
        </div>

        <form onSubmit={handleScan} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="field">
            <span>קוד QR</span>
            <input
              ref={inputRef}
              value={qrCode}
              onChange={e => setQrCode(e.target.value.toUpperCase())}
              placeholder="LOC-XXXX-XXXX"
              autoFocus
              autoComplete="off"
              style={{ fontSize: '1.1rem', letterSpacing: '.08em', direction: 'ltr', textAlign: 'center' }}
            />
          </label>

          {gpsLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '.85rem' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              <span>מאתר מיקום GPS...</span>
            </div>
          )}

          <button className="button button--primary" type="submit"
            disabled={loading || !qrCode.trim()} style={{ height: 50, fontSize: '1rem' }}>
            {loading ? <span className="spinner" /> : 'אשר כניסה / יציאה'}
          </button>
        </form>
      </div>
    </div>
  )
}
