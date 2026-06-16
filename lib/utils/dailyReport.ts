import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ReportSection, VisitLog, VisitCheck, DeficiencyReport } from '@/lib/supabase/types'

type Service = SupabaseClient<Database>

// Builds the daily manager report for a single Asia/Bangkok calendar day.
// `dateStr` is YYYY-MM-DD in Bangkok time. Returns the email subject + HTML body.
// All aggregation is scoped to that day; sections follow the `sections` array.

const TZ = 'Asia/Bangkok'

// Bangkok calendar date (YYYY-MM-DD) for `now`, shifted by `offsetDays`.
export function bangkokDateStr(now: Date = new Date(), offsetDays = 0): string {
  const shifted = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000)
  // en-CA gives YYYY-MM-DD; timeZone pins it to Bangkok.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted)
}

// Current hour (0-23) in Bangkok.
export function bangkokHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now).slice(0, 2))
}

function bangkokDayWindow(dateStr: string): { startIso: string; endIso: string } {
  // Bangkok is UTC+7 year round (no DST), so the offset is constant.
  const startMs = new Date(`${dateStr}T00:00:00+07:00`).getTime()
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  }
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function fmtHebrewDate(dateStr: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${dateStr}T12:00:00+07:00`))
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

type LocAgg = { locName: string; entries: number; exits: number; minutes: number }
type VisitChecksAgg = { time: string; inspName: string; locName: string; items: { name: string; note: string | null }[] }

export async function buildDailyReport(
  service: Service,
  dateStr: string,
  sections: ReportSection[],
): Promise<{ subject: string; html: string }> {
  const { startIso, endIso } = bangkokDayWindow(dateStr)

  const [{ data: logsData }, { data: checksData }, { data: defsData }] = await Promise.all([
    service.from('visit_logs')
      .select('id,action_type,location_id,inspector_id,created_at,internal_status,inspector:profiles(id,full_name),location:locations(id,name,city)')
      .gte('created_at', startIso).lt('created_at', endIso)
      .order('created_at', { ascending: true }),
    service.from('visit_checks')
      .select('id,visit_log_id,item_name,note,created_at,inspector:profiles(id,full_name),location:locations(id,name)')
      .gte('created_at', startIso).lt('created_at', endIso)
      .order('created_at', { ascending: true }),
    service.from('deficiency_reports')
      .select('id,report_type,description,created_at,inspector:profiles(id,full_name),location:locations(id,name,city)')
      .gte('created_at', startIso).lt('created_at', endIso)
      .order('created_at', { ascending: true }),
  ])

  const logs = (logsData ?? []) as VisitLog[]
  const checks = (checksData ?? []) as VisitCheck[]
  const defs = (defsData ?? []) as DeficiencyReport[]

  // Per inspector, then per restaurant: entry/exit counts and total time spent.
  const perInspector = new Map<string, { name: string; locs: Map<string, LocAgg> }>()
  const ensureLoc = (inspId: string, inspName: string, locId: string, locName: string): LocAgg => {
    let ins = perInspector.get(inspId)
    if (!ins) { ins = { name: inspName, locs: new Map() }; perInspector.set(inspId, ins) }
    let loc = ins.locs.get(locId)
    if (!loc) { loc = { locName, entries: 0, exits: 0, minutes: 0 }; ins.locs.set(locId, loc) }
    return loc
  }

  for (const l of logs) {
    if (l.internal_status !== 'success' || !l.location_id) continue
    const loc = ensureLoc(l.inspector_id, l.inspector?.full_name ?? 'לא ידוע', l.location_id, l.location?.name ?? 'לא ידוע')
    if (l.action_type === 'entry') loc.entries++
    else if (l.action_type === 'exit') loc.exits++
  }

  // Total time per inspector+restaurant: pair each entry with the next exit.
  const openEntry: Record<string, VisitLog> = {}
  for (const l of logs) {
    if (l.internal_status !== 'success' || !l.location_id) continue
    const key = `${l.inspector_id}|${l.location_id}`
    if (l.action_type === 'entry') {
      openEntry[key] = l
    } else if (l.action_type === 'exit' && openEntry[key]) {
      const mins = Math.round((new Date(l.created_at).getTime() - new Date(openEntry[key].created_at).getTime()) / 60000)
      if (mins >= 0 && mins < 1440) {
        ensureLoc(l.inspector_id, l.inspector?.full_name ?? 'לא ידוע', l.location_id, l.location?.name ?? 'לא ידוע').minutes += mins
      }
      delete openEntry[key]
    }
  }

  // Checklist items grouped per visit (per exit scan).
  const visitChecks = new Map<string, VisitChecksAgg>()
  for (const c of checks) {
    let v = visitChecks.get(c.visit_log_id)
    if (!v) {
      v = { time: c.created_at, inspName: c.inspector?.full_name ?? 'לא ידוע', locName: c.location?.name ?? 'לא ידוע', items: [] }
      visitChecks.set(c.visit_log_id, v)
    }
    v.items.push({ name: c.item_name ?? '', note: c.note })
  }

  const hasActivity = logs.length > 0 || checks.length > 0 || defs.length > 0

  // ---- Render ----
  // Gmail and others often ignore dir on <html>, so direction:rtl is set inline
  // on the container, every table, and every cell (plus dir="rtl" attributes).
  const styles = {
    table: 'width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:14px;direction:rtl;',
    th: 'text-align:right;padding:8px 10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;direction:rtl;',
    td: 'text-align:right;padding:8px 10px;border:1px solid #e2e8f0;direction:rtl;',
    h2: 'font-size:16px;margin:22px 0 4px;color:#0f172a;text-align:right;direction:rtl;',
    muted: 'color:#64748b;font-size:13px;text-align:right;direction:rtl;',
  }

  const parts: string[] = []

  if (sections.includes('time_per_restaurant')) {
    parts.push(`<h2 style="${styles.h2}">פעילות לפי משגיח ומסעדה</h2>`)
    if (perInspector.size === 0) {
      parts.push(`<p style="${styles.muted}">לא נרשמה פעילות.</p>`)
    } else {
      // One block per mashgiach: every restaurant he was in that day, with total
      // check-ins, check-outs and total time spent (daily).
      for (const ins of [...perInspector.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'))) {
        const locs = [...ins.locs.values()].sort((a, b) => b.minutes - a.minutes)
        const totalMin = locs.reduce((s, l) => s + l.minutes, 0)
        const totalEntries = locs.reduce((s, l) => s + l.entries, 0)
        const totalExits = locs.reduce((s, l) => s + l.exits, 0)
        const rows = locs.map(l => `
          <tr>
            <td style="${styles.td}">${esc(l.locName)}</td>
            <td style="${styles.td}">${l.entries}</td>
            <td style="${styles.td}">${l.exits}</td>
            <td style="${styles.td}">${fmtMinutes(l.minutes)}</td>
          </tr>`).join('')
        parts.push(`<p style="margin:18px 0 2px;font-weight:700;text-align:right;direction:rtl;">${esc(ins.name)}</p>
          <table dir="rtl" style="${styles.table}">
            <thead><tr>
              <th style="${styles.th}">מסעדה</th>
              <th style="${styles.th}">כניסות</th>
              <th style="${styles.th}">יציאות</th>
              <th style="${styles.th}">זמן שהייה (שעות:דקות)</th>
            </tr></thead>
            <tbody>${rows}
              <tr>
                <td style="${styles.td};font-weight:700;background:#f8fafc;">סך הכל</td>
                <td style="${styles.td};font-weight:700;background:#f8fafc;">${totalEntries}</td>
                <td style="${styles.td};font-weight:700;background:#f8fafc;">${totalExits}</td>
                <td style="${styles.td};font-weight:700;background:#f8fafc;">${fmtMinutes(totalMin)}</td>
              </tr>
            </tbody></table>`)
      }
    }
  }

  if (sections.includes('deficiencies')) {
    parts.push(`<h2 style="${styles.h2}">ליקויי כשרות והערות שדווחו</h2>`)
    if (defs.length === 0) {
      parts.push(`<p style="${styles.muted}">לא דווחו ליקויים או הערות.</p>`)
    } else {
      const rows = defs.map(d => `
        <tr>
          <td style="${styles.td}">${fmtTime(d.created_at)}</td>
          <td style="${styles.td}">${esc(d.inspector?.full_name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${esc(d.location?.name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${d.report_type === 'deficiency' ? 'ליקוי כשרות' : 'הערה'}</td>
          <td style="${styles.td}">${esc(d.description ?? '')}</td>
        </tr>`).join('')
      parts.push(`<table style="${styles.table}">
        <thead><tr>
          <th style="${styles.th}">שעה</th>
          <th style="${styles.th}">משגיח</th>
          <th style="${styles.th}">מסעדה</th>
          <th style="${styles.th}">סוג</th>
          <th style="${styles.th}">תיאור</th>
        </tr></thead>
        <tbody>${rows}</tbody></table>`)
    }
  }

  if (sections.includes('checklist_details')) {
    parts.push(`<h2 style="${styles.h2}">פירוט בדיקות שבוצעו בביקורים</h2>`)
    if (visitChecks.size === 0) {
      parts.push(`<p style="${styles.muted}">לא תועדו בדיקות.</p>`)
    } else {
      for (const v of [...visitChecks.values()].sort((a, b) => a.time.localeCompare(b.time))) {
        const items = v.items.map(i => `
          <tr>
            <td style="${styles.td}">${esc(i.name)}</td>
            <td style="${styles.td}">${esc(i.note ?? '')}</td>
          </tr>`).join('')
        parts.push(`<p dir="rtl" style="margin:14px 0 2px;font-weight:700;text-align:right;direction:rtl;">${esc(v.locName)} - ${esc(v.inspName)} <span style="${styles.muted}">(${fmtTime(v.time)})</span></p>
          <table dir="rtl" style="${styles.table}">
            <thead><tr><th style="${styles.th}">בדיקה</th><th style="${styles.th}">הערה</th></tr></thead>
            <tbody>${items}</tbody></table>`)
      }
    }
  }

  const subject = `דוח יומי - ${fmtHebrewDate(dateStr)}`
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body dir="rtl" style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;direction:rtl;">
  <div dir="rtl" style="max-width:760px;margin:0 auto;padding:24px;direction:rtl;text-align:right;">
    <h1 style="font-size:20px;margin:0 0 2px;text-align:right;direction:rtl;">דוח פעילות יומי</h1>
    <p style="${styles.muted};margin:0 0 14px;">${fmtHebrewDate(dateStr)} (שעון בנגקוק)</p>
    ${hasActivity ? parts.join('\n') : `<p style="${styles.muted}">לא נרשמה פעילות ביום זה.</p>`}
    <p style="${styles.muted};margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">הופק אוטומטית על ידי מערכת Mashgiach.</p>
  </div>
</body></html>`

  return { subject, html }
}
