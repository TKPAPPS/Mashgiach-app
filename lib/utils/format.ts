const hebrewDate = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

export function formatDateTime(iso: string) {
  return hebrewDate.format(new Date(iso))
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
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
