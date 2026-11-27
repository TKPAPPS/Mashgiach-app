'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { readPosition, postScan, scanErrorMessage, afterScanPath, GPS_CODES } from '@/lib/utils/scanClient'

type Phase = 'idle' | 'confirm' | 'working' | 'failed'

// "כניסה במיקום" / "יציאה במיקום" on the restaurant page: records the visit from
// the phone's location, without the QR. The server always requires a location
// within 100 m for this button, whatever the GPS mode (see the scan route).
export default function LocationCheckIn({ locationId, locationName, inside, onChanged }: {
  locationId: string
  locationName: string
  inside: boolean
  /** Reload the page data (after an entry, or when the state changed elsewhere). */
  onChanged: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<{ text: string; canCorrect: boolean } | null>(null)
  const action: 'entry' | 'exit' = inside ? 'exit' : 'entry'
  const label = action === 'entry' ? 'כניסה במיקום' : 'יציאה במיקום'
  const what = action === 'entry' ? 'הכניסה' : 'היציאה'

  function close() { if (phase !== 'working') { setPhase('idle'); setError(null) } }

  async function record() {
    setPhase('working'); setError(null)
    const pos = await readPosition()
    let data
    try {
      data = await postScan({ location_id: locationId, expected_action: action, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, gps_error: pos.gpsError })
    } catch {
      setError({ text: 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.', canCorrect: false }); setPhase('failed'); return
    }
    if (!data.success) {
      const code = data.code ?? ''
      if (code === 'state_changed') {
        setPhase('idle'); onChanged()
        toast(scanErrorMessage(code), 'error')
        return
      }
      setError({ text: scanErrorMessage(code, { distance: data.distance, gpsError: pos.gpsError, what }), canCorrect: GPS_CODES.has(code) })
      setPhase('failed')
      return
    }
    setPhase('idle')
    toast(data.action_type === 'entry' ? 'כניסה נרשמה בהצלחה' : 'יציאה נרשמה בהצלחה', 'success')
    const next = afterScanPath(data)
    if (next) { router.push(next); return }
    if (data.action_type === 'entry') onChanged()
    else router.push('/inspector')
  }

  function openCorrection() {
    try { localStorage.setItem('inspectorTab', 'scancorrect') } catch {}
    router.push('/inspector')
  }

  return (
    <>
      <button type="button" className="button button--ghost" data-testid="location-checkin"
        style={{ height: 48, fontSize: '.95rem', gap: 8 }} onClick={() => setPhase('confirm')}>
        <MapPin size={17} /> {label}
      </button>

      <Modal open={phase !== 'idle'} onClose={close} title={label}
        footer={phase === 'failed' ? <>
          <button className="button button--ghost" onClick={close}>סגור</button>
          <button className="button button--primary" onClick={record}>נסה שוב</button>
        </> : <>
          <button className="button button--ghost" onClick={close} disabled={phase === 'working'}>ביטול</button>
          <button className="button button--primary" onClick={record} disabled={phase === 'working'} data-testid="location-checkin-confirm">
            {phase === 'working' ? <><span className="spinner" style={{ width: 16, height: 16 }} /> מאתר מיקום...</> : action === 'entry' ? 'רשום כניסה' : 'רשום יציאה'}
          </button>
        </>}>
        {phase === 'failed' && error
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, color: 'var(--danger)', lineHeight: 1.6 }} role="alert">{error.text}</p>
              {error.canCorrect && (
                <button type="button" className="button button--ghost" onClick={openCorrection}>
                  שלח בקשת תיקון סריקה למנהל
                </button>
              )}
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>
                {what} ל<strong>{locationName}</strong> תירשם לפי המיקום של הטלפון, בלי לסרוק QR.
              </p>
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted)' }}>
                צריך להיות במסעדה (עד 100 מטר) ושהמיקום בטלפון יהיה פעיל.
              </p>
            </div>}
      </Modal>
    </>
  )
}
