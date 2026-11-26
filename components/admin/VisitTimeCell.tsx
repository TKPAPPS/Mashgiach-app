import { Clock } from 'lucide-react'
import type { VisitCell } from '@/lib/utils/visits'

// "זמן שהייה" column: duration on the exit row, live/unclosed state on the entry row.
export default function VisitTimeCell({ cell }: { cell?: VisitCell }) {
  if (!cell) return <span className="mutedCell">-</span>
  if (cell.kind === 'duration') {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.85rem', color: 'var(--primary)', fontWeight: 500 }}><Clock size={12} aria-hidden />{cell.text}</span>
  }
  if (cell.kind === 'open') return <span className="badge badge--success">{cell.text}</span>
  return <span className="badge badge--warning" title={cell.kind === 'no_exit' ? 'לא נסרקה יציאה לביקור זה' : 'נסרקה יציאה בלי כניסה תואמת'}>{cell.text}</span>
}
