import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMonthlyReport, prevMonthWindow, bangkokDayOfMonth, bangkokHour, bangkokMonthKey } from '@/lib/utils/dailyReport'
import { sendReportEmail } from '@/lib/utils/sendReportEmail'
import type { ReportSection } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

// Fixed monthly schedule: the 1st of the month at 09:00 Asia/Bangkok.
const MONTHLY_DAY = 1
const MONTHLY_HOUR = 9

// Scheduled endpoint hit by an external cron (e.g. cron-job.org), ideally once
// per hour. It self-gates: it only sends when Bangkok is the 1st of the month at
// 09:00 AND it has not already sent for this month. This makes it idempotent and
// tolerant of hourly polling or cron drift. Recipients are shared with the daily
// report. Auth via CRON_SECRET (Authorization: Bearer <secret>, or ?secret=).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || req.nextUrl.searchParams.get('secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data: row } = await service.from('report_settings').select('*').limit(1).maybeSingle()

  if (!row) return NextResponse.json({ status: 'no-config' })
  if (!row.monthly_enabled) return NextResponse.json({ status: 'disabled' })
  if (!row.recipients?.length) return NextResponse.json({ status: 'no-recipients' })

  const now = new Date()
  const monthKey = bangkokMonthKey(now)

  // Force send regardless of date for manual testing: ?force=1
  const force = req.nextUrl.searchParams.get('force') === '1'

  if (!force) {
    if (bangkokDayOfMonth(now) !== MONTHLY_DAY || bangkokHour(now) !== MONTHLY_HOUR) {
      return NextResponse.json({ status: 'not-time-yet' })
    }
    if (row.monthly_last_sent_month === monthKey) return NextResponse.json({ status: 'already-sent' })
  }

  const sections = (row.monthly_sections?.length ? row.monthly_sections : ['time_per_restaurant', 'deficiencies', 'checklist_details']) as ReportSection[]
  const { startIso, endIso, label } = prevMonthWindow(now)

  const { subject, html } = await buildMonthlyReport(service, startIso, endIso, label, sections)
  const res = await sendReportEmail(row.recipients, subject, html)

  if (!res.ok) return NextResponse.json({ status: 'send-failed', error: res.error }, { status: 500 })

  await service.from('report_settings').update({ monthly_last_sent_month: monthKey }).eq('id', row.id)
  return NextResponse.json({ status: 'sent', month: label, recipients: row.recipients.length })
}
