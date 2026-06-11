import type { VisitLog } from '@/lib/supabase/types'

// Pair each exit scan with its preceding entry (per inspector + location) and
// return the time spent as "H:MM", keyed by the exit log's id. Pairs longer
// than 24h are dropped as data gaps. Shared by ReportsTab and DashboardTab.
export function computeTimeSpent(logs: VisitLog[]): Record<string, string> {
  const sorted = [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const lastEntry: Record<string, VisitLog> = {}
  const result: Record<string, string> = {}
  for (const log of sorted) {
    const key = `${log.inspector_id}|${log.location_id ?? ''}`
    if (log.action_type === 'entry') {
      lastEntry[key] = log
    } else if (log.action_type === 'exit' && lastEntry[key]) {
      const ms = new Date(log.created_at).getTime() - new Date(lastEntry[key].created_at).getTime()
      const mins = Math.round(ms / 60000)
      if (mins >= 0 && mins < 1440) {
        const h = Math.floor(mins / 60)
        const m = mins % 60
        result[log.id] = `${h}:${String(m).padStart(2, '0')}`
      }
      delete lastEntry[key]
    }
  }
  return result
}
