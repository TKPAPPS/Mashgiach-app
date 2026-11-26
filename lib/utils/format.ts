const BANGKOK_TZ = 'Asia/Bangkok'

const hebrewDate = new Intl.DateTimeFormat('he-IL', {
  timeZone: BANGKOK_TZ,
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

export function formatDateTime(iso: string) {
  return hebrewDate.format(new Date(iso))
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: BANGKOK_TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

export function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'עכשיו'
  if (mins < 60) return `לפני ${mins} דקות`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `לפני ${hrs} שעות`
  const days = Math.floor(hrs / 24)
  return `לפני ${days} ימים`
}

export function statusLabel(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    success:          { label: 'בוצע בהצלחה',        cls: 'badge--success' },
    unauthorized:     { label: 'לא מורשה',             cls: 'badge--warning' },
    invalid_location: { label: 'מקום לא תקין',         cls: 'badge--danger'  },
    gps_mismatch:     { label: 'חריגת GPS',             cls: 'badge--warning' },
    gps_rejected:     { label: 'נדחה: GPS',             cls: 'badge--danger'  },
    error:            { label: 'שגיאה',                cls: 'badge--danger'  },
  }
  return map[status] ?? { label: status, cls: 'badge--muted' }
}

export function actionLabel(action: string) {
  return action === 'entry' ? 'כניסה' : 'יציאה'
}

export function roleLabel(role: string) {
  return role === 'admin' ? 'מנהל' : 'משגיח'
}

export function requestTypeLabel(type: string) {
  const map: Record<string, string> = {
    vacation: 'חופשה', absence: 'היעדרות', replacement: 'החלפה', other: 'אחר'
  }
  return map[type] ?? type
}

export function adminStatusLabel(status: string) {
  const map: Record<string, string> = { open: 'פתוח', in_progress: 'בטיפול', resolved: 'טופל' }
  return map[status] ?? status
}

export function reportTypeLabel(type: string) {
  return type === 'deficiency' ? 'ליקוי כשרות' : 'הערה כללית'
}

export function genQrCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = (n: number) => Math.floor(Math.random() * n)
  return `LOC-${Array.from({length:4}, ()=>chars[rand(chars.length)]).join('')}-${Array.from({length:4}, ()=>chars[rand(chars.length)]).join('')}`
}

/** Distance for display: metres under 1 km, else km with one decimal under 100 km. */
export function formatDistance(m: number | null | undefined): string {
  if (m == null) return '-'
  if (m < 1000) return `${m} מ׳`
  const km = m / 1000
  return `${km < 100 ? km.toFixed(1) : Math.round(km).toLocaleString('he-IL')} ק״מ`
}

/** What a GPS alert means, for the dashboard and the email report. */
export function gpsAlertLabel(type: string | null | undefined, distance: number | null | undefined): string {
  switch (type) {
    case 'no_gps': return 'ללא מיקום (נחסם)'
    case 'low_accuracy': return `מיקום לא מדויק (נחסם)${distance != null ? `, ${formatDistance(distance)}` : ''}`
    case 'location_no_coords': return 'למסעדה אין מיקום (נחסם)'
    case 'impossible_travel': return `נסיעה בלתי אפשרית: ${formatDistance(distance)} מהסריקה הקודמת`
    default: return `סריקה רחוקה: ${formatDistance(distance)}`
  }
}

export const KASHRUT_TYPE_LABELS: Record<'meat' | 'dairy' | 'fish', string> = {
  meat: 'בשרי',
  dairy: 'חלבי',
  fish: 'דגים',
}
