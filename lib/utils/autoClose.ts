// Auto-close of an open visit (manager's 27/11 list, 2ג). An entry with no exit
// after report_settings.auto_close_hours is stamped visit_logs.auto_closed_at by
// /api/cron/forgot-exit. It never gets an invented exit time: it counts 0
// minutes and shows "נסגר אוטומטית". An approved correction still closes it.

export const AUTO_CLOSE_DEFAULT_H = 12
/** Allowed values, kept in step with the DB CHECK (4..12). */
export const AUTO_CLOSE_OPTIONS = [4, 6, 8, 10, 12] as const

export function validAutoCloseHours(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 4 && v <= 12
}

/** The reminder has to go out before the visit closes. 0 (reminder off) is always fine. */
export function reminderFitsAutoClose(reminderMinutes: number, autoCloseHours: number): boolean {
  return reminderMinutes === 0 || reminderMinutes < autoCloseHours * 60
}

export function autoCloseLabel(hours: number): string {
  return `אחרי ${hours} שעות`
}

export function autoCloseMessage(locationName: string, entryIso: string) {
  const clock = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(entryIso))
  return {
    title: 'הביקור נסגר אוטומטית',
    body: `הביקור ב${locationName} מ-${clock} נסגר כי לא נסרקה יציאה, ולא נספר לו זמן. אם היית שם, שלח בקשת תיקון סריקה.`,
    url: '/inspector',
  }
}
