import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ReportSection, VisitLog, VisitCheck, DeficiencyReport } from '@/lib/supabase/types'
import { pairVisits, PAIRING_MARGIN_MS } from '@/lib/utils/visits'
import { gpsAlertLabel } from '@/lib/utils/format'
import { certStatus, fmtDay, CERT_WARN_DAYS, bangkokToday } from '@/lib/utils/certExpiry'

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

// Day of month (1-31) in Bangkok.
export function bangkokDayOfMonth(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, day: '2-digit' }).format(now))
}

// Bangkok month key 'YYYY-MM' for `now` (idempotency guard for the monthly send).
export function bangkokMonthKey(now: Date = new Date()): string {
  return bangkokDateStr(now).slice(0, 7)
}

function shiftIso(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString()
}

// Visit time per inspector + restaurant, via the shared pairVisits(). A visit
// belongs to the day (or month) of its ENTRY, so one that ends after midnight
// counts in full on the day it started. Only visits whose two scans were both
// clean ('success') count toward time; GPS-flagged visits are left out, as before.
function addVisitMinutes(
  allLogs: VisitLog[],
  startIso: string,
  endIso: string,
  ensureLoc: (inspId: string, inspName: string, locId: string, locName: string) => LocAgg,
) {
  for (const p of pairVisits(allLogs)) {
    if (p.state !== 'closed' || !p.entry || !p.exit || !p.entry.location_id || p.flagged) continue
    if (p.entry.internal_status !== 'success' || p.exit.internal_status !== 'success') continue
    if (p.entry.created_at < startIso || p.entry.created_at >= endIso) continue
    const e = p.entry
    ensureLoc(e.inspector_id, e.inspector?.full_name ?? 'לא ידוע', e.location_id!, e.location?.name ?? 'לא ידוע').minutes += p.minutes ?? 0
  }
}

// PostgREST returns at most 1000 rows per request. A month has 1,600 to 3,000
// scans, so every report query pages through with range() (before 26/11/2026 the
// monthly report silently covered only the first 1000 rows of the month).
const PAGE = 1000
type RangeQuery = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> }
export async function fetchAll<T>(build: () => RangeQuery): Promise<{ data: T[] }> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) { console.error('report query failed', error); break }
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return { data: out }
}

type Styles = { table: string; th: string; td: string; h2: string; muted: string }
type AlertRow = { created_at: string; alert_type: string | null; distance_meters: number | null; inspector_id: string | null; inspector?: { full_name?: string } | null; location?: { name?: string } | null }

// GPS section: per inspector, scans without a location, far scans, blocked scans and
// impossible-travel alerts in the window; the daily report also lists each alert.
async function gpsSection(
  service: Service, startIso: string, endIso: string, logs: VisitLog[], styles: Styles, detail: boolean,
): Promise<{ html: string; alertCount: number }> {
  const { data } = await fetchAll<AlertRow>(() => service.from('gps_alerts')
    .select('created_at,alert_type,distance_meters,inspector_id,inspector:profiles(full_name),location:locations(name)')
    .gte('created_at', startIso).lt('created_at', endIso)
    .order('created_at', { ascending: true }).order('id', { ascending: true }))
  const alerts = (data ?? []) as AlertRow[]

  type Agg = { name: string; noGps: number; far: number; blocked: number; travel: number }
  const per = new Map<string, Agg>()
  const get = (id: string, name: string) => {
    let a = per.get(id)
    if (!a) { a = { name, noGps: 0, far: 0, blocked: 0, travel: 0 }; per.set(id, a) }
    return a
  }
  for (const l of logs) {
    if (!l.inspector_id) continue
    const name = l.inspector?.full_name ?? 'לא ידוע'
    if (l.gps_check === 'no_gps') get(l.inspector_id, name).noGps++
    if (l.gps_check === 'too_far') get(l.inspector_id, name).far++
    if (l.internal_status === 'gps_rejected') get(l.inspector_id, name).blocked++
  }
  for (const a of alerts) {
    if (a.alert_type === 'impossible_travel' && a.inspector_id) get(a.inspector_id, a.inspector?.full_name ?? 'לא ידוע').travel++
  }

  const out: string[] = [`<h2 style="${styles.h2}">חריגות מיקום (GPS)</h2>`]
  const rows = [...per.values()].filter(a => a.noGps + a.far + a.blocked + a.travel > 0)
    .sort((a, b) => (b.noGps + b.far + b.blocked + b.travel) - (a.noGps + a.far + a.blocked + a.travel))
  if (rows.length === 0) {
    out.push(`<p style="${styles.muted}">לא נרשמו חריגות מיקום.</p>`)
    return { html: out.join('\n'), alertCount: alerts.length }
  }
  out.push(`<table dir="rtl" style="${styles.table}">
    <thead><tr>
      <th style="${styles.th}">משגיח</th>
      <th style="${styles.th}">סריקות ללא מיקום</th>
      <th style="${styles.th}">סריקות רחוקות (מעל 100 מ׳)</th>
      <th style="${styles.th}">סריקות שנחסמו</th>
      <th style="${styles.th}">נסיעה בלתי אפשרית</th>
    </tr></thead>
    <tbody>${rows.map(a => `
      <tr>
        <td style="${styles.td}">${esc(a.name)}</td>
        <td style="${styles.td}">${a.noGps}</td>
        <td style="${styles.td}">${a.far}</td>
        <td style="${styles.td}">${a.blocked}</td>
        <td style="${styles.td}${a.travel ? ';color:#b91c1c;font-weight:700;' : ''}">${a.travel}</td>
      </tr>`).join('')}
    </tbody></table>`)
  if (detail && alerts.length > 0) {
    const MAX = 50
    out.push(`<table dir="rtl" style="${styles.table}">
      <thead><tr>
        <th style="${styles.th}">שעה</th><th style="${styles.th}">משגיח</th><th style="${styles.th}">מסעדה</th><th style="${styles.th}">חריגה</th>
      </tr></thead>
      <tbody>${alerts.slice(0, MAX).map(a => `
        <tr>
          <td style="${styles.td}">${fmtTime(a.created_at)}</td>
          <td style="${styles.td}">${esc(a.inspector?.full_name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${esc(a.location?.name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${esc(gpsAlertLabel(a.alert_type, a.distance_meters))}</td>
        </tr>`).join('')}
      </tbody></table>`)
    if (alerts.length > MAX) out.push(`<p style="${styles.muted}">ועוד ${alerts.length - MAX} חריגות. הרשימה המלאה בלוח הבקרה.</p>`)
  }
  return { html: out.join('\n'), alertCount: alerts.length }
}

// "ביקורים שלא נסגרו": visits whose ENTRY is in the window and that never got an
// exit scan (closed automatically, never closed, or still open at send time),
// plus how many correction requests are waiting for the manager.
async function openVisitsSection(
  service: Service, allLogs: VisitLog[], startIso: string, endIso: string, styles: Styles, detail: boolean,
): Promise<{ html: string; count: number }> {
  const pairs = pairVisits(allLogs).filter(p =>
    p.entry && (p.state === 'no_exit' || p.state === 'open') &&
    p.entry.created_at >= startIso && p.entry.created_at < endIso)
  const { count: pending } = await service.from('scan_corrections').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  const out: string[] = [`<h2 style="${styles.h2}">ביקורים שלא נסגרו</h2>`]
  const pendingLine = pending ? `<p style="${styles.muted}">בקשות תיקון סריקה שממתינות לאישור: <strong>${pending}</strong> (לשונית תיקוני סריקה).</p>` : ''
  if (pairs.length === 0) {
    out.push(`<p style="${styles.muted}">כל הביקורים נסגרו בסריקת יציאה.</p>`, pendingLine)
    return { html: out.join('\n'), count: 0 }
  }
  const stateText = (p: (typeof pairs)[number]) => p.state === 'open' ? 'עדיין פתוח' : p.autoClosed ? 'נסגר אוטומטית' : 'לא נסגר'
  if (detail) {
    out.push(`<table dir="rtl" style="${styles.table}">
      <thead><tr>
        <th style="${styles.th}">כניסה</th><th style="${styles.th}">משגיח</th><th style="${styles.th}">מסעדה</th><th style="${styles.th}">מצב</th>
      </tr></thead>
      <tbody>${pairs.sort((a, b) => a.entry!.created_at.localeCompare(b.entry!.created_at)).map(p => `
        <tr>
          <td style="${styles.td}">${fmtTime(p.entry!.created_at)}</td>
          <td style="${styles.td}">${esc(p.entry!.inspector?.full_name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${esc(p.entry!.location?.name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${stateText(p)}</td>
        </tr>`).join('')}
      </tbody></table>`)
    out.push(`<p style="${styles.muted}">לביקור שלא נסגר לא נספר זמן. אם המשגיח היה במקום, הוא יכול לשלוח בקשת תיקון סריקה.</p>`)
  } else {
    // Monthly: count per inspector.
    const per = new Map<string, { name: string; total: number; auto: number }>()
    for (const p of pairs) {
      const id = p.entry!.inspector_id
      const a = per.get(id) ?? { name: p.entry!.inspector?.full_name ?? 'לא ידוע', total: 0, auto: 0 }
      a.total++; if (p.autoClosed) a.auto++
      per.set(id, a)
    }
    out.push(`<table dir="rtl" style="${styles.table}">
      <thead><tr><th style="${styles.th}">משגיח</th><th style="${styles.th}">ביקורים שלא נסגרו</th><th style="${styles.th}">מתוכם נסגרו אוטומטית</th></tr></thead>
      <tbody>${[...per.values()].sort((a, b) => b.total - a.total).map(a => `
        <tr><td style="${styles.td}">${esc(a.name)}</td><td style="${styles.td}">${a.total}</td><td style="${styles.td}">${a.auto}</td></tr>`).join('')}
      </tbody></table>`)
  }
  out.push(pendingLine)
  return { html: out.join('\n'), count: pairs.length }
}

// "תעודות כשרות": certificates that expire within 30 days or have expired. The
// full list on a day an alert went out (last 24 hours), one line otherwise.
async function certificateSection(service: Service, styles: Styles, now: Date = new Date()): Promise<{ html: string; count: number }> {
  const until = new Date(Date.parse(`${bangkokToday(now)}T00:00:00Z`) + CERT_WARN_DAYS * 86400_000).toISOString().slice(0, 10)
  const [{ data: due }, { count: noDate }] = await Promise.all([
    service.from('locations').select('id,name,kashrus_certificate_expires_on,certificate_alert_at')
      .eq('status', 'active').not('kashrus_certificate_expires_on', 'is', null).lte('kashrus_certificate_expires_on', until)
      .order('kashrus_certificate_expires_on'),
    service.from('locations').select('id', { count: 'exact', head: true })
      .eq('status', 'active').not('kashrus_certificate_url', 'is', null).is('kashrus_certificate_expires_on', null),
  ])
  const rows = (due ?? []) as { id: string; name: string; kashrus_certificate_expires_on: string; certificate_alert_at: string | null }[]
  const out: string[] = [`<h2 style="${styles.h2}">תעודות כשרות</h2>`]
  const since = now.getTime() - 24 * 3600_000
  const fresh = rows.some(r => r.certificate_alert_at && Date.parse(r.certificate_alert_at) >= since)
  if (rows.length === 0) out.push(`<p style="${styles.muted}">אין תעודה שפוקעת ב-30 הימים הקרובים.</p>`)
  else if (!fresh) out.push(`<p style="${styles.muted}">${rows.length} תעודות פוקעות ב-30 הימים הקרובים או פגו. הרשימה בלוח הבקרה.</p>`)
  else {
    out.push(`<table dir="rtl" style="${styles.table}">
      <thead><tr><th style="${styles.th}">מסעדה</th><th style="${styles.th}">בתוקף עד</th><th style="${styles.th}">מצב</th></tr></thead>
      <tbody>${rows.map(r => {
        const st = certStatus(r.kashrus_certificate_expires_on, now)!
        const red = st.kind === 'expired' || st.kind === 'urgent'
        return `<tr><td style="${styles.td}">${esc(r.name)}</td><td style="${styles.td}">${fmtDay(r.kashrus_certificate_expires_on)}</td><td style="${styles.td}${red ? ';color:#b91c1c;font-weight:700;' : ''}">${st.text}</td></tr>`
      }).join('')}
      </tbody></table>`)
  }
  if (noDate) out.push(`<p style="${styles.muted}">${noDate} תעודות עדיין בלי תאריך תפוגה, ולכן לא תצא עליהן התראה.</p>`)
  return { html: out.join('\n'), count: rows.length }
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

// Short day + month (e.g. "5 ביולי") for a monthly report row, in Bangkok time.
function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso))
}

// Hebrew "month year" label (e.g. "יולי 2026") for a 1-based month.
function fmtHebrewMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, '0')
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, month: 'long', year: 'numeric' })
    .format(new Date(`${year}-${mm}-15T12:00:00+07:00`))
}

// Window covering the whole Bangkok calendar month *before* `now`.
// Returns ISO bounds plus the previous month's year/number and a Hebrew label.
export function prevMonthWindow(now: Date = new Date()): {
  startIso: string; endIso: string; year: number; month: number; label: string
} {
  const [curYear, curMonth] = bangkokMonthKey(now).split('-').map(Number)
  const year = curMonth === 1 ? curYear - 1 : curYear
  const month = curMonth === 1 ? 12 : curMonth - 1
  const mm = String(month).padStart(2, '0')
  const curMm = String(curMonth).padStart(2, '0')
  return {
    // Bangkok is UTC+7 year round (no DST), so the offset is constant.
    startIso: new Date(`${year}-${mm}-01T00:00:00+07:00`).toISOString(),
    endIso: new Date(`${curYear}-${curMm}-01T00:00:00+07:00`).toISOString(),
    year,
    month,
    label: fmtHebrewMonth(year, month),
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

type LocAgg = { locName: string; entries: number; exits: number; minutes: number }
type VisitChecksAgg = { time: string; inspName: string; locName: string; items: { name: string; note: string | null }[]; noPhotoReason?: string | null }

export async function buildDailyReport(
  service: Service,
  dateStr: string,
  sections: ReportSection[],
): Promise<{ subject: string; html: string }> {
  const { startIso, endIso } = bangkokDayWindow(dateStr)

  const [{ data: logsData }, { data: checksData }, { data: defsData }] = await Promise.all([
    fetchAll<VisitLog>(() => service.from('visit_logs')
      .select('id,action_type,location_id,inspector_id,created_at,internal_status,gps_check,auto_closed_at,manual_correction,proof_skip_reason,inspector:profiles(id,full_name),location:locations(id,name,city)')
      .gte('created_at', shiftIso(startIso, -PAIRING_MARGIN_MS)).lt('created_at', shiftIso(endIso, PAIRING_MARGIN_MS))
      .order('created_at', { ascending: true }).order('id', { ascending: true })),
    fetchAll<VisitCheck>(() => service.from('visit_checks')
      .select('id,visit_log_id,item_name,note,created_at,inspector:profiles(id,full_name),location:locations(id,name)')
      .gte('created_at', startIso).lt('created_at', endIso)
      .order('created_at', { ascending: true }).order('id', { ascending: true })),
    fetchAll<DeficiencyReport>(() => service.from('deficiency_reports')
      .select('id,report_type,description,created_at,inspector:profiles(id,full_name),location:locations(id,name,city)')
      .gte('created_at', startIso).lt('created_at', endIso)
      .order('created_at', { ascending: true }).order('id', { ascending: true })),
  ])

  // Fetched with a margin either side so visits crossing midnight pair up;
  // `logs` is only the rows inside the window.
  const allLogs = (logsData ?? []) as VisitLog[]
  const logs = allLogs.filter(l => l.created_at >= startIso && l.created_at < endIso)
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

  addVisitMinutes(allLogs, startIso, endIso, ensureLoc)

  // Checklist items grouped per visit (per exit scan).
  const visitChecks = new Map<string, VisitChecksAgg>()
  for (const c of checks) {
    let v = visitChecks.get(c.visit_log_id)
    if (!v) {
      v = { time: c.created_at, inspName: c.inspector?.full_name ?? 'לא ידוע', locName: c.location?.name ?? 'לא ידוע', items: [],
        noPhotoReason: allLogs.find(l => l.id === c.visit_log_id)?.proof_skip_reason ?? null }
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
            <tbody>${items}</tbody></table>${v.noPhotoReason ? `
          <p dir="rtl" style="margin:-10px 0 14px;color:#b45309;font-size:13px;text-align:right;direction:rtl;">ללא תמונת הוכחה. הסיבה שנכתבה: ${esc(v.noPhotoReason)}</p>` : ''}`)
      }
    }
  }

  let gpsAlertCount = 0
  if (sections.includes('gps_alerts')) {
    const g = await gpsSection(service, startIso, endIso, logs, styles, true)
    parts.push(g.html)
    gpsAlertCount = g.alertCount
  }

  let openCount = 0
  if (sections.includes('open_visits')) {
    const o = await openVisitsSection(service, allLogs, startIso, endIso, styles, true)
    parts.push(o.html)
    openCount = o.count
  }

  let certCount = 0
  if (sections.includes('certificate_expiry')) {
    const c = await certificateSection(service, styles)
    parts.push(c.html)
    certCount = c.count
  }
  gpsAlertCount += openCount + certCount // anything here is worth sending even on a quiet day

  const subject = `דוח יומי - ${fmtHebrewDate(dateStr)}`
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body dir="rtl" style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;direction:rtl;">
  <div dir="rtl" style="max-width:760px;margin:0 auto;padding:24px;direction:rtl;text-align:right;">
    <h1 style="font-size:20px;margin:0 0 2px;text-align:right;direction:rtl;">דוח פעילות יומי</h1>
    <p style="${styles.muted};margin:0 0 14px;">${fmtHebrewDate(dateStr)} (שעון בנגקוק)</p>
    ${hasActivity || gpsAlertCount > 0 ? parts.join('\n') : `<p style="${styles.muted}">לא נרשמה פעילות ביום זה.</p>`}
    <p style="${styles.muted};margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">הופק אוטומטית על ידי מערכת Mashgiach.</p>
  </div>
</body></html>`

  return { subject, html }
}

type ChecklistLocAgg = { locName: string; visits: Set<string>; items: number }

// Builds the monthly manager summary for a whole Asia/Bangkok calendar month.
// The window is [startIso, endIso). `label` is the Hebrew "month year" title.
// Aggregate-oriented (a full month of raw per-visit checklist detail would be
// enormous): activity totals, a dated deficiency list, and a per-restaurant
// checklist completion summary. Sections reuse the daily `ReportSection` keys.
export async function buildMonthlyReport(
  service: Service,
  startIso: string,
  endIso: string,
  label: string,
  sections: ReportSection[],
): Promise<{ subject: string; html: string }> {
  const wantChecks = sections.includes('checklist_details')
  const wantDefs = sections.includes('deficiencies')

  const [{ data: logsData }, { data: checksData }, { data: defsData }] = await Promise.all([
    fetchAll<VisitLog>(() => service.from('visit_logs')
      .select('id,action_type,location_id,inspector_id,created_at,internal_status,gps_check,auto_closed_at,manual_correction,proof_skip_reason,inspector:profiles(id,full_name),location:locations(id,name,city)')
      .gte('created_at', shiftIso(startIso, -PAIRING_MARGIN_MS)).lt('created_at', shiftIso(endIso, PAIRING_MARGIN_MS))
      .order('created_at', { ascending: true }).order('id', { ascending: true })),
    wantChecks
      ? fetchAll<VisitCheck>(() => service.from('visit_checks')
          .select('id,visit_log_id,item_name,note,created_at,location:locations(id,name)')
          .gte('created_at', startIso).lt('created_at', endIso)
          .order('created_at', { ascending: true }).order('id', { ascending: true }))
      : Promise.resolve({ data: [] as VisitCheck[] }),
    wantDefs
      ? fetchAll<DeficiencyReport>(() => service.from('deficiency_reports')
          .select('id,report_type,description,created_at,location_id,inspector:profiles(id,full_name),location:locations(id,name,city)')
          .gte('created_at', startIso).lt('created_at', endIso)
          .order('created_at', { ascending: true }).order('id', { ascending: true }))
      : Promise.resolve({ data: [] as DeficiencyReport[] }),
  ])

  // Fetched with a margin either side so visits crossing midnight pair up;
  // `logs` is only the rows inside the window.
  const allLogs = (logsData ?? []) as VisitLog[]
  const logs = allLogs.filter(l => l.created_at >= startIso && l.created_at < endIso)
  const checks = (checksData ?? []) as VisitCheck[]
  const defs = (defsData ?? []) as DeficiencyReport[]

  // Per inspector, then per restaurant: entry/exit counts and total time. Same
  // aggregation as the daily report, only the window is a whole month.
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

  addVisitMinutes(allLogs, startIso, endIso, ensureLoc)

  // Checklist completion summary: per restaurant, how many visits had checks and
  // how many items were checked in total across the month.
  const checklistByLoc = new Map<string, ChecklistLocAgg>()
  for (const c of checks) {
    const locId = c.location?.id ?? 'unknown'
    let agg = checklistByLoc.get(locId)
    if (!agg) { agg = { locName: c.location?.name ?? 'לא ידוע', visits: new Set(), items: 0 }; checklistByLoc.set(locId, agg) }
    agg.visits.add(c.visit_log_id)
    agg.items++
  }

  // Overview totals.
  const totalEntries = [...perInspector.values()].reduce((s, ins) => s + [...ins.locs.values()].reduce((t, l) => t + l.entries, 0), 0)
  const totalMinutes = [...perInspector.values()].reduce((s, ins) => s + [...ins.locs.values()].reduce((t, l) => t + l.minutes, 0), 0)
  const restaurantsCovered = new Set(logs.filter(l => l.internal_status === 'success' && l.location_id).map(l => l.location_id)).size

  const hasActivity = logs.length > 0 || checks.length > 0 || defs.length > 0

  const styles = {
    table: 'width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:14px;direction:rtl;',
    th: 'text-align:right;padding:8px 10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700;direction:rtl;',
    td: 'text-align:right;padding:8px 10px;border:1px solid #e2e8f0;direction:rtl;',
    h2: 'font-size:16px;margin:22px 0 4px;color:#0f172a;text-align:right;direction:rtl;',
    muted: 'color:#64748b;font-size:13px;text-align:right;direction:rtl;',
  }

  const parts: string[] = []

  // Compact overview strip.
  parts.push(`<table dir="rtl" style="${styles.table}">
    <tbody><tr>
      <td style="${styles.td};background:#f8fafc;font-weight:700;">כניסות סה"כ</td><td style="${styles.td}">${totalEntries}</td>
      <td style="${styles.td};background:#f8fafc;font-weight:700;">שעות שהייה סה"כ</td><td style="${styles.td}">${fmtMinutes(totalMinutes)}</td>
      <td style="${styles.td};background:#f8fafc;font-weight:700;">משגיחים פעילים</td><td style="${styles.td}">${perInspector.size}</td>
      <td style="${styles.td};background:#f8fafc;font-weight:700;">מסעדות</td><td style="${styles.td}">${restaurantsCovered}</td>
    </tr></tbody></table>`)

  if (sections.includes('time_per_restaurant')) {
    parts.push(`<h2 style="${styles.h2}">פעילות לפי משגיח ומסעדה (חודשי)</h2>`)
    if (perInspector.size === 0) {
      parts.push(`<p style="${styles.muted}">לא נרשמה פעילות.</p>`)
    } else {
      for (const ins of [...perInspector.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'))) {
        const locs = [...ins.locs.values()].sort((a, b) => b.minutes - a.minutes)
        const totalMin = locs.reduce((s, l) => s + l.minutes, 0)
        const insEntries = locs.reduce((s, l) => s + l.entries, 0)
        const insExits = locs.reduce((s, l) => s + l.exits, 0)
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
                <td style="${styles.td};font-weight:700;background:#f8fafc;">${insEntries}</td>
                <td style="${styles.td};font-weight:700;background:#f8fafc;">${insExits}</td>
                <td style="${styles.td};font-weight:700;background:#f8fafc;">${fmtMinutes(totalMin)}</td>
              </tr>
            </tbody></table>`)
      }
    }
  }

  if (wantDefs) {
    parts.push(`<h2 style="${styles.h2}">ליקויי כשרות והערות שדווחו</h2>`)
    if (defs.length === 0) {
      parts.push(`<p style="${styles.muted}">לא דווחו ליקויים או הערות.</p>`)
    } else {
      const rows = defs.map(d => `
        <tr>
          <td style="${styles.td}">${fmtDate(d.created_at)}</td>
          <td style="${styles.td}">${esc(d.inspector?.full_name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${esc(d.location?.name ?? 'לא ידוע')}</td>
          <td style="${styles.td}">${d.report_type === 'deficiency' ? 'ליקוי כשרות' : 'הערה'}</td>
          <td style="${styles.td}">${esc(d.description ?? '')}</td>
        </tr>`).join('')
      parts.push(`<table style="${styles.table}">
        <thead><tr>
          <th style="${styles.th}">תאריך</th>
          <th style="${styles.th}">משגיח</th>
          <th style="${styles.th}">מסעדה</th>
          <th style="${styles.th}">סוג</th>
          <th style="${styles.th}">תיאור</th>
        </tr></thead>
        <tbody>${rows}</tbody></table>`)
    }
  }

  if (wantChecks) {
    parts.push(`<h2 style="${styles.h2}">סיכום בדיקות שבוצעו לפי מסעדה</h2>`)
    if (checklistByLoc.size === 0) {
      parts.push(`<p style="${styles.muted}">לא תועדו בדיקות.</p>`)
    } else {
      const rows = [...checklistByLoc.values()]
        .sort((a, b) => b.items - a.items)
        .map(a => `
          <tr>
            <td style="${styles.td}">${esc(a.locName)}</td>
            <td style="${styles.td}">${a.visits.size}</td>
            <td style="${styles.td}">${a.items}</td>
          </tr>`).join('')
      parts.push(`<table dir="rtl" style="${styles.table}">
        <thead><tr>
          <th style="${styles.th}">מסעדה</th>
          <th style="${styles.th}">ביקורים עם בדיקות</th>
          <th style="${styles.th}">סך בדיקות</th>
        </tr></thead>
        <tbody>${rows}</tbody></table>`)
    }
  }

  let gpsAlertCount = 0
  if (sections.includes('gps_alerts')) {
    const g = await gpsSection(service, startIso, endIso, logs, styles, false)
    parts.push(g.html)
    gpsAlertCount = g.alertCount
  }

  if (sections.includes('open_visits')) {
    const o = await openVisitsSection(service, allLogs, startIso, endIso, styles, false)
    parts.push(o.html)
    gpsAlertCount += o.count
  }

  const subject = `דוח חודשי - ${label}`
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body dir="rtl" style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;direction:rtl;">
  <div dir="rtl" style="max-width:760px;margin:0 auto;padding:24px;direction:rtl;text-align:right;">
    <h1 style="font-size:20px;margin:0 0 2px;text-align:right;direction:rtl;">דוח פעילות חודשי</h1>
    <p style="${styles.muted};margin:0 0 14px;">${esc(label)} (שעון בנגקוק)</p>
    ${hasActivity || gpsAlertCount > 0 ? parts.join('\n') : `<p style="${styles.muted}">לא נרשמה פעילות בחודש זה.</p>`}
    <p style="${styles.muted};margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">הופק אוטומטית על ידי מערכת Mashgiach.</p>
  </div>
</body></html>`

  return { subject, html }
}
