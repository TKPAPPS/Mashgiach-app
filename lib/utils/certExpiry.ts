// Kashrut certificate expiry (manager's 27/11 list, 2ה). Dates are Bangkok
// calendar days. Alerts go out in stages so each one is sent once, and a missed
// day still sends: 1 = 30 days left, 2 = 7 days left, 3 = expired.

const TZ = 'Asia/Bangkok'
export const CERT_WARN_DAYS = 30
export const CERT_URGENT_DAYS = 7

export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Whole days from today (Bangkok) to the expiry date; 0 = expires today, negative = expired. */
export function daysLeft(expiresOn: string, now: Date = new Date()): number {
  const today = Date.parse(`${bangkokToday(now)}T00:00:00Z`)
  const end = Date.parse(`${expiresOn.slice(0, 10)}T00:00:00Z`)
  return Math.round((end - today) / 86400_000)
}

/** The alert stage a certificate should be at: 0 none, 1 within 30 days, 2 within 7, 3 expired. */
export function stageFor(days: number): 0 | 1 | 2 | 3 {
  if (days < 0) return 3
  if (days <= CERT_URGENT_DAYS) return 2
  if (days <= CERT_WARN_DAYS) return 1
  return 0
}

export type CertStatus = { kind: 'ok' | 'soon' | 'urgent' | 'expired'; days: number; text: string }

/** Hebrew status line, or null when there is no date. */
export function certStatus(expiresOn: string | null | undefined, now: Date = new Date()): CertStatus | null {
  if (!expiresOn) return null
  const d = daysLeft(expiresOn, now)
  if (d < 0) return { kind: 'expired', days: d, text: d === -1 ? 'פג תוקף אתמול' : `פג תוקף לפני ${-d} ימים` }
  if (d === 0) return { kind: 'urgent', days: d, text: 'פוקע היום' }
  if (d <= CERT_URGENT_DAYS) return { kind: 'urgent', days: d, text: d === 1 ? 'פוקע מחר' : `פוקע בעוד ${d} ימים` }
  if (d <= CERT_WARN_DAYS) return { kind: 'soon', days: d, text: `פוקע בעוד ${d} ימים` }
  return { kind: 'ok', days: d, text: `בתוקף עוד ${d} ימים` }
}

export function certBadgeClass(kind: CertStatus['kind']): string {
  return kind === 'expired' || kind === 'urgent' ? 'badge--danger' : kind === 'soon' ? 'badge--warning' : 'badge--success'
}

/** dd/mm/yyyy for a YYYY-MM-DD date. */
export function fmtDay(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function certAlertMessage(locationName: string, expiresOn: string, stage: 1 | 2 | 3) {
  const when = fmtDay(expiresOn)
  if (stage === 3) return { title: 'תעודת כשרות פגה', body: `התעודה של ${locationName} פגה ב-${when}. יש להעלות תעודה חדשה.`, url: '/admin' }
  if (stage === 2) return { title: 'תעודת כשרות פוקעת השבוע', body: `התעודה של ${locationName} פוקעת ב-${when}.`, url: '/admin' }
  return { title: 'תעודת כשרות פוקעת בעוד חודש', body: `התעודה של ${locationName} פוקעת ב-${when}.`, url: '/admin' }
}
