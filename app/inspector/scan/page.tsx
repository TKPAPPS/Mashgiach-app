'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Camera } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type ScanResult = {
  success: boolean
  code?: string
  action_type?: string
  location_name?: string
  location_id?: string
  visit_log_id?: string
  has_checklist?: boolean
  distance?: number | null
  gps_warning?: string | null
}

const GPS_CODES = new Set(['no_gps', 'low_accuracy', 'too_far', 'location_no_coords'])

function gpsErrorMessage(code: string, distance?: number | null, gpsError?: string | null): string {
  switch (code) {
    case 'no_gps':
      return gpsError === 'denied'
        ? 'הסריקה לא נרשמה: אין הרשאת מיקום. יש לאפשר גישה למיקום לאתר בהגדרות הטלפון (הגדרות > פרטיות > שירותי מיקום) ולנסות שוב.'
        : 'הסריקה לא נרשמה: לא התקבל מיקום מהטלפון. ודא ששירותי המיקום פועלים ונסה שוב, רצוי ליד חלון או בכניסה.'
    case 'low_accuracy':
      return 'הסריקה לא נרשמה: המיקום שהתקבל לא מדויק מספיק. המתן כמה שניות ונסה שוב.'
    case 'too_far':
      return `הסריקה לא נרשמה: אתה נמצא ${distance != null ? `כ-${distance} מטר` : 'רחוק'} מהמסעדה. יש לסרוק במקום.`
    case 'location_no_coords':
      return 'הסריקה לא נרשמה: למסעדה זו עדיין לא הוגדר מיקום במערכת. פנה למנהל.'
    default:
      return 'קוד QR לא תקין. נסה שוב.'
  }
}

function gpsWarningMessage(code: string, gpsError?: string | null): string {
  if (code === 'no_gps') return gpsError === 'denied'
    ? 'שים לב: אין הרשאת מיקום. בקרוב סריקה בלי מיקום לא תירשם. יש לאפשר מיקום בהגדרות.'
    : 'שים לב: לא התקבל מיקום. בקרוב סריקה בלי מיקום לא תירשם.'
  if (code === 'too_far') return 'שים לב: הסריקה בוצעה רחוק מהמסעדה וסומנה לבדיקה.'
  if (code === 'low_accuracy') return 'שים לב: המיקום לא היה מדויק והסריקה סומנה לבדיקה.'
  return 'שים לב: הסריקה סומנה לבדיקה.'
}

export default function ScanPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [scanError, setScanError] = useState<string | null>(null)
  const [canCorrect, setCanCorrect] = useState(false)
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
    let accuracy: number | null = null
    let gpsError: string | null = null
    if (!('geolocation' in navigator)) {
      gpsError = 'unsupported'
    } else {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
        accuracy = pos.coords.accuracy
      } catch (err) {
        const code = (err as GeolocationPositionError | undefined)?.code
        gpsError = code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable'
      }
    }

    let data: ScanResult
    try {
      const res = await fetch('/api/inspector/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code: qrCode.trim(), lat, lng, accuracy, gps_error: gpsError }),
      })
      data = await res.json()
    } catch {
      setScanError('אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.')
      setProcessing(false)
      return
    }

    if (!data.success) {
      const code = data.code ?? ''
      setCanCorrect(GPS_CODES.has(code))
      setScanError(
        code === 'unauthorized' ? 'אינך משויך למקום זה'
        : code === 'forbidden' ? 'רק משגיחים יכולים לרשום סריקה.'
        : code === 'error' ? 'הסריקה לא נשמרה בגלל תקלה בשרת. נסה שוב.'
        : gpsErrorMessage(code, data.distance, gpsError))
      setProcessing(false)
      return
    }

    if (data.gps_warning) toast(gpsWarningMessage(data.gps_warning, gpsError), 'error')

    if (data.action_type === 'exit' && data.has_checklist && data.visit_log_id && data.location_id) {
      router.push(`/inspector/checklist?visit_log_id=${data.visit_log_id}&location_id=${data.location_id}`)
      return
    }

    // Brief confirmation popup (persists across navigation via the app-level
    // Toast provider), then leave the scanner: check-in opens the location page
    // (its procedure), check-out returns home.
    toast(data.action_type === 'entry' ? 'כניסה נרשמה בהצלחה' : 'יציאה נרשמה בהצלחה', 'success')
    if (data.action_type === 'entry' && data.location_id) {
      router.push(`/inspector/location/${data.location_id}`)
    } else {
      router.push('/inspector')
    }
  }, [router, toast])

  useEffect(() => {
    let stopped = false

    async function start() {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (stopped) return

      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner as unknown as { stop: () => Promise<void> }

      const config = { fps: 10, qrbox: { width: 240, height: 240 } }
      const onScan = (text: string) => { doScan(text) }
      const noop = () => {}

      // Always prefer the rear camera. `exact` forces it where one exists; the
      // soft hint and label-based enumeration are fallbacks for devices that
      // ignore `exact` or have no environment-facing camera (e.g. laptops).
      try {
        await scanner.start({ facingMode: { exact: 'environment' } }, config, onScan, noop)
      } catch {
        try {
          await scanner.start({ facingMode: 'environment' }, config, onScan, noop)
        } catch {
          try {
            const cameras = await Html5Qrcode.getCameras()
            const rear = cameras.find(c => /back|rear|environment/i.test(c.label)) ?? cameras[cameras.length - 1]
            if (!rear) throw new Error('no camera')
            await scanner.start(rear.id, config, onScan, noop)
          } catch {
            setCameraError('לא ניתן לגשת למצלמה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.')
          }
        }
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
    setScanError(null)
    setCanCorrect(false)
    setProcessing(false)
    setCameraError(null)
    router.replace('/inspector/scan')
  }

  if (scanError) {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', fontSize: '1rem', maxWidth: 280 }}>{scanError}</p>
        <button className="button button--primary" onClick={handleRetry}>נסה שוב</button>
        {canCorrect && (
          <button className="button button--ghost" onClick={() => {
            try { localStorage.setItem('inspectorTab', 'scancorrect') } catch {}
            router.push('/inspector')
          }}>שלח בקשת תיקון סריקה למנהל</button>
        )}
        <button className="button button--ghost" onClick={() => router.push('/inspector')}>
          <ArrowRight size={15} /> חזור לבית
        </button>
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
            <div className="scanBox">
              <div id="qr-reader" style={{ width: '100%', height: '100%' }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
