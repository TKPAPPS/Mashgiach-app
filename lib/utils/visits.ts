import type { VisitLog, VisitStatus } from '@/lib/supabase/types'
import { MAX_VISIT_HOURS } from '@/lib/utils/gps'

// Rows that are real visits. Rejected, unauthorized and invalid scans are audit
// rows and never take part in pairing.
export const COUNTED_STATUSES: VisitStatus[] = ['success', 'gps_mismatch']

const MAX_VISIT_MS = MAX_VISIT_HOURS * 3600_000
const TZ = 'Asia/Bangkok'

type PairLog = Pick<VisitLog, 'id' | 'inspector_id' | 'location_id' | 'action_type' | 'created_at'> &
  Partial<Pick<VisitLog, 'internal_status' | 'gps_check'>>

export type VisitState =
  | 'closed'      // entry + exit within MAX_VISIT_HOURS
  | 'open'        // entry, no exit yet, still within MAX_VISIT_HOURS (inspector is inside)
  | 'no_exit'     // entry never closed (followed by another entry, or older than MAX_VISIT_HOURS)
  | 'orphan_exit' // exit with no usable entry before it

export type VisitPair<L extends PairLog = PairLog> = {
  inspector_id: string
  location_id: string | null
  entry: L | null
  exit: L | null
  minutes: number | null
  state: VisitState
  /** True when either scan was a GPS mismatch (counted but suspicious). */
  flagged: boolean
}

export function isCounted(l: Pick<PairLog, 'internal_status'>): boolean {
  return !l.internal_status || COUNTED_STATUSES.includes(l.internal_status)
}

/**
 * Pair entry and exit scans per inspector + location. The single source of truth
 * for visit time in the admin UI and both email reports.
 * - Only counted rows (success, gps_mismatch) take part.
 * - An exit closes the open entry only if it is within MAX_VISIT_HOURS; a longer
 *   gap means the inspector forgot to scan out, so the entry is "no_exit" and the
 *   exit is an orphan (the same rule the scan route uses to pick entry vs exit).
 * - Two entries in a row: the first is "no_exit".
 */
export function pairVisits<L extends PairLog>(logs: L[], now: number = Date.now()): VisitPair<L>[] {
  // Rows whose inspector was deleted have inspector_id null; they belong to
  // different people, so they must never pair with each other.
  const sorted = logs.filter(l => isCounted(l) && !!l.inspector_id).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const open = new Map<string, L>()
  const out: VisitPair<L>[] = []
  const flag = (l: L | null) => !!l && l.internal_status === 'gps_mismatch'
  const pair = (entry: L | null, exit: L | null, state: VisitState, minutes: number | null): VisitPair<L> => ({
    inspector_id: (entry ?? exit)!.inspector_id,
    location_id: (entry ?? exit)!.location_id,
    entry, exit, minutes, state, flagged: flag(entry) || flag(exit),
  })

  for (const l of sorted) {
    const key = `${l.inspector_id}|${l.location_id ?? ''}`
    const prev = open.get(key)
    if (l.action_type === 'entry') {
      if (prev) out.push(pair(prev, null, 'no_exit', null))
      open.set(key, l)
    } else {
      const gap = prev ? new Date(l.created_at).getTime() - new Date(prev.created_at).getTime() : Infinity
      if (prev && gap >= 0 && gap <= MAX_VISIT_MS) {
        out.push(pair(prev, l, 'closed', Math.round(gap / 60000)))
      } else {
        if (prev) out.push(pair(prev, null, 'no_exit', null))
        out.push(pair(null, l, 'orphan_exit', null))
      }
      open.delete(key)
    }
  }
  for (const l of open.values()) {
    const age = now - new Date(l.created_at).getTime()
    out.push(pair(l, null, age > MAX_VISIT_MS ? 'no_exit' : 'open', null))
  }
  return out
}

export function fmtMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

function fmtClock(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export type VisitCell = { text: string; kind: 'duration' | 'open' | 'no_exit' | 'orphan' }

/**
 * Text for the "זמן שהייה" column, keyed by log id. The duration sits on the
 * exit row; an entry shows "בפנים מאז" (open) or "לא נסגר" (never closed); an
 * exit without an entry shows "ללא כניסה". Shared by ReportsTab and DashboardTab.
 */
export function visitCells(logs: PairLog[], now: number = Date.now()): Record<string, VisitCell> {
  const cells: Record<string, VisitCell> = {}
  for (const p of pairVisits(logs, now)) {
    if (p.state === 'closed' && p.exit) cells[p.exit.id] = { text: fmtMinutes(p.minutes ?? 0), kind: 'duration' }
    else if (p.state === 'open' && p.entry) cells[p.entry.id] = { text: `בפנים מאז ${fmtClock(p.entry.created_at)}`, kind: 'open' }
    else if (p.state === 'no_exit' && p.entry) cells[p.entry.id] = { text: 'לא נסגר', kind: 'no_exit' }
    else if (p.state === 'orphan_exit' && p.exit) cells[p.exit.id] = { text: 'ללא כניסה', kind: 'orphan' }
  }
  return cells
}

/** Bangkok calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function bangkokDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** ISO bounds for a Bangkok calendar date range (inclusive dates). */
export function bangkokRange(from?: string | null, to?: string | null): { fromIso: string | null; toIso: string | null } {
  return {
    fromIso: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : null,
    toIso: to ? new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 24 * 3600_000).toISOString() : null, // exclusive
  }
}

/** How far before/after a window to fetch so visits crossing its edges pair correctly. */
export const PAIRING_MARGIN_MS = MAX_VISIT_MS

/**
 * Is the inspector inside this restaurant now? True when the last counted scan
 * there is an entry that is not older than MAX_VISIT_HOURS (an older one was
 * never closed; the next scan opens a new visit, same rule as the scan route).
 */
export function isInside(last: Pick<VisitLog, 'action_type' | 'created_at'> | null | undefined, now: number = Date.now()): boolean {
  if (!last || last.action_type !== 'entry') return false
  return now - new Date(last.created_at).getTime() <= MAX_VISIT_MS
}
