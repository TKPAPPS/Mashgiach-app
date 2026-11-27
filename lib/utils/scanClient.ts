// Browser side of recording a visit: read the phone's location, call
// /api/inspector/scan, and turn the answer into Hebrew text. Shared by the QR
// scan page and the "כניסה במיקום" button on the restaurant page.

export type ScanResult = {
  success: boolean
  code?: string
  action_type?: 'entry' | 'exit'
  location_name?: string
  location_id?: string
  visit_log_id?: string
  has_checklist?: boolean
  distance?: number | null
  gps_warning?: string | null
  duplicate?: boolean
}

export type Position = { lat: number | null; lng: number | null; accuracy: number | null; gpsError: string | null }

/** Codes that mean "the location check failed": the inspector may send a correction request. */
export const GPS_CODES = new Set(['no_gps', 'low_accuracy', 'too_far', 'location_no_coords'])

export async function readPosition(): Promise<Position> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { lat: null, lng: null, accuracy: null, gpsError: 'unsupported' }
  }
  try {
    const pos = await new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }))
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, gpsError: null }
  } catch (err) {
    const code = (err as GeolocationPositionError | undefined)?.code
    return { lat: null, lng: null, accuracy: null, gpsError: code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable' }
  }
}

/** POST to the scan route. Throws only when the server cannot be reached. */
export async function postScan(body: Record<string, unknown>): Promise<ScanResult> {
  const res = await fetch('/api/inspector/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

/**
 * Hebrew text for a refused scan. `what` names the action in the sentence:
 * "הסריקה" for a QR scan, "הכניסה" / "היציאה" for the location button.
 */
export function scanErrorMessage(code: string, opts: { distance?: number | null; gpsError?: string | null; what?: string } = {}): string {
  const what = opts.what ?? 'הסריקה'
  const notSaved = `${what} לא נרשמה`
  switch (code) {
    case 'no_gps':
      return opts.gpsError === 'denied'
        ? `${notSaved}: אין הרשאת מיקום. יש לאפשר גישה למיקום לאתר בהגדרות הטלפון (הגדרות > פרטיות > שירותי מיקום) ולנסות שוב.`
        : `${notSaved}: לא התקבל מיקום מהטלפון. ודא ששירותי המיקום פועלים ונסה שוב, רצוי ליד חלון או בכניסה.`
    case 'low_accuracy':
      return `${notSaved}: המיקום שהתקבל לא מדויק מספיק. המתן כמה שניות ונסה שוב.`
    case 'too_far':
      return `${notSaved}: אתה נמצא ${opts.distance != null ? `כ-${opts.distance} מטר` : 'רחוק'} מהמסעדה. יש להיות במקום.`
    case 'location_no_coords':
      return `${notSaved}: למסעדה זו עדיין לא הוגדר מיקום במערכת. פנה למנהל.`
    case 'unauthorized':
      return 'אינך משויך למקום זה'
    case 'forbidden':
      return 'רק משגיחים יכולים לרשום סריקה.'
    case 'error':
      return `${what} לא נשמרה בגלל תקלה בשרת. נסה שוב.`
    case 'state_changed':
      return 'המצב במקום השתנה בינתיים (כניסה או יציאה כבר נרשמה). הדף רוענן, בדוק ונסה שוב.'
    case 'too_soon':
      return 'נרשמה פעולה במקום הזה לפני פחות מ-2 דקות. נסה שוב בעוד רגע.'
    case 'location_checkin_off':
      return 'כניסה במיקום כבויה כרגע. יש לסרוק את קוד ה-QR.'
    case 'invalid_location':
      return 'המקום לא נמצא או לא פעיל.'
    default:
      return 'קוד QR לא תקין. נסה שוב.'
  }
}

/** Text for a scan that was saved but flagged (warn mode, QR only). */
export function scanWarningMessage(code: string, gpsError?: string | null): string {
  if (code === 'no_gps') return gpsError === 'denied'
    ? 'שים לב: אין הרשאת מיקום. בקרוב סריקה בלי מיקום לא תירשם. יש לאפשר מיקום בהגדרות.'
    : 'שים לב: לא התקבל מיקום. בקרוב סריקה בלי מיקום לא תירשם.'
  if (code === 'too_far') return 'שים לב: הסריקה בוצעה רחוק מהמסעדה וסומנה לבדיקה.'
  if (code === 'low_accuracy') return 'שים לב: המיקום לא היה מדויק והסריקה סומנה לבדיקה.'
  return 'שים לב: הסריקה סומנה לבדיקה.'
}

/** Where to go after a recorded visit (same for QR and location). */
export function afterScanPath(r: ScanResult): string | null {
  if (r.action_type === 'exit' && r.has_checklist && r.visit_log_id && r.location_id) {
    return `/inspector/checklist?visit_log_id=${r.visit_log_id}&location_id=${r.location_id}`
  }
  return null
}
