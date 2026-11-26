// Forgot-exit reminder (manager's point 7). An inspector who scanned in and has
// not scanned out after report_settings.forgot_exit_minutes gets one push. The
// cron route /api/cron/forgot-exit runs every 15 minutes (cron-job.org).

export const FORGOT_EXIT_DEFAULT_MIN = 240
/** Allowed values; 0 turns the reminder off. Kept in step with the DB CHECK (0 or 30..720). */
export const FORGOT_EXIT_OPTIONS = [0, 60, 120, 180, 240, 300, 360, 480] as const

export function validForgotExitMinutes(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && (v === 0 || (v >= 30 && v <= 720))
}

type Row = { id: string; inspector_id: string | null; location_id: string | null; created_at: string }

/**
 * Entries that are still open: no later counted scan (entry or exit) by the same
 * inspector at the same location. `later` holds the counted scans of the
 * candidates' inspectors since the oldest candidate.
 */
export function pickForgotten<C extends Row>(candidates: C[], later: Row[]): C[] {
  const latest = new Map<string, string>()
  for (const l of later) {
    if (!l.inspector_id) continue
    const key = `${l.inspector_id}|${l.location_id ?? ''}`
    const prev = latest.get(key)
    if (!prev || l.created_at > prev) latest.set(key, l.created_at)
  }
  return candidates.filter(c => {
    if (!c.inspector_id) return false
    const last = latest.get(`${c.inspector_id}|${c.location_id ?? ''}`)
    return !last || last <= c.created_at
  })
}

export function forgotExitMessage(locationName: string, entryIso: string) {
  const clock = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(entryIso))
  return {
    title: 'שכחת לסרוק יציאה?',
    body: `נכנסת ל${locationName} ב-${clock} ועדיין לא נסרקה יציאה. אם אתה עדיין שם, סרוק ביציאה. אם כבר יצאת, שלח בקשת תיקון סריקה.`,
    url: '/inspector',
  }
}

export function forgotExitLabel(minutes: number): string {
  if (minutes === 0) return 'כבוי'
  const h = minutes / 60
  return Number.isInteger(h) ? (h === 1 ? 'אחרי שעה' : `אחרי ${h} שעות`) : `אחרי ${minutes} דקות`
}
