'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowRight, Camera } from 'lucide-react'

type ScanResult = {
  success: boolean
  action_type?: string
  location_name?: string
  location_id?: string
  visit_log_id?: string
  has_checklist?: boolean
}

export default function ScanPage() {
  const router = useRouter()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const hasScanned = useRef(false)

  const doScan = useCallback(async (qrCode: string) => {
    if (hasScanned.current) return
    hasScanned.current = true
    setProcessing(true)

    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }

    let lat: number | null = null
    let lng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 0 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {}

    const res = await fetch('/api/inspector/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_code: qrCode.trim(), lat, lng }),
    })
    const data: ScanResult = await res.json()

    if (data.success && data.action_type === 'exit' && data.has_checklist && data.visit_log_id && data.location_id) {
      router.push(`/inspector/checklist?visit_log_id=${data.visit_log_id}&location_id=${data.location_id}`)
      return
    }

    setResult(data)
    setProcessing(false)
  }, [router])

  useEffect(() => {
    let stopped = false

    async function start() {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (stopped) return

      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner as unknown as { stop: () => Promise<void> }

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text: string) => { doScan(text) },
          () => {}
        )
      } catch {
        setCameraError('לא ניתן לגשת למצלמה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.')
      }
    }

    start()

    return () => {
      stopped = true
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [doScan])

  function handleRetry() {
    hasScanned.current = false
    setResult(null)
    setProcessing(false)
    setCameraError(null)
    // Remount the scanner by navigating to self
    router.replace('/inspector/scan')
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
            <button className="button button--ghost" onClick={handleRetry}>סריקה נוספת</button>
            <button className="button button--ghost" onClick={() => router.push('/inspector')}>
              <ArrowRight size={15} /> חזור לבית
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (processing) {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span className="spinner" style={{ width: 40, height: 40 }} />
        <p style={{ color: 'var(--muted)' }}>מעבד סריקה...</p>
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

      <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        {cameraError ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Camera size={48} style={{ color: 'var(--muted)' }} />
            <p style={{ color: 'var(--danger)', fontSize: '.95rem', maxWidth: 280 }}>{cameraError}</p>
            <button className="button button--ghost" onClick={() => router.push('/inspector')}>
              <ArrowRight size={15} /> חזור לבית
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '.875rem', textAlign: 'center' }}>
              כוון את המצלמה לקוד ה-QR שמוצג במקום
            </p>
            <div className="scanBox" style={{ maxWidth: 320 }}>
              <div id="qr-reader" style={{ width: '100%', height: '100%' }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
