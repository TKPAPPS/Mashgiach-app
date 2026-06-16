import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildDailyReport, bangkokDateStr, bangkokHour } from '@/lib/utils/dailyReport'
import { sendReportEmail } from '@/lib/utils/sendReportEmail'
import type { ReportSection } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

// Scheduled endpoint hit by an external cron (e.g. cron-job.org), ideally once
// per hour. It self-gates: it only sends when the current Bangkok hour matches
// the configured send_time hour AND it has not already sent today. This makes it
// idempotent and tolerant of hourly polling or cron drift. Auth via CRON_SECRET
// (Authorization: Bearer <secret>, or ?secret=).
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
  if (!row.enabled) return NextResponse.json({ status: 'disabled' })
  if (!row.recipients?.length) return NextResponse.json({ status: 'no-recipients' })

  const now = new Date()
  const todayBkk = bangkokDateStr(now)
  const targetHour = Number((row.send_time ?? '10:00').slice(0, 2))

  // Force send regardless of hour for manual testing: ?force=1
  const force = req.nextUrl.searchParams.get('force') === '1'

  if (!force) {
    if (bangkokHour(now) !== targetHour) return NextResponse.json({ status: 'not-time-yet', targetHour })
    if (row.last_sent_date === todayBkk) return NextResponse.json({ status: 'already-sent' })
  }

  const sections = (row.sections?.length ? row.sections : ['summary', 'time_per_restaurant', 'deficiencies', 'checklist_details']) as ReportSection[]
  const dateStr = bangkokDateStr(now, -1) // yesterday in Bangkok

  const { subject, html } = await buildDailyReport(service, dateStr, sections)
  const res = await sendReportEmail(row.recipients, subject, html)

  if (!res.ok) return NextResponse.json({ status: 'send-failed', error: res.error }, { status: 500 })

  await service.from('report_settings').update({ last_sent_date: todayBkk }).eq('id', row.id)
  return NextResponse.json({ status: 'sent', date: dateStr, recipients: row.recipients.length })
}
