import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { buildDailyReport, bangkokDateStr } from '@/lib/utils/dailyReport'
import { sendReportEmail } from '@/lib/utils/sendReportEmail'
import { getSettingsRow } from '../route'
import type { ReportSection } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

// Builds yesterday's report and sends it immediately to the configured
// recipients, so a manager can preview the email without waiting for the cron.
export async function POST() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const row = await getSettingsRow(service)
  if (!row) return NextResponse.json({ error: 'שגיאה בטעינת ההגדרות' }, { status: 500 })
  if (!row.recipients?.length) return NextResponse.json({ error: 'יש להזין נמענים ולשמור לפני שליחת בדיקה' }, { status: 400 })

  const sections = (row.sections?.length ? row.sections : ['time_per_restaurant', 'deficiencies', 'checklist_details']) as ReportSection[]
  const dateStr = bangkokDateStr(new Date(), -1) // yesterday in Bangkok

  const { subject, html } = await buildDailyReport(service, dateStr, sections)
  const res = await sendReportEmail(row.recipients, `[בדיקה] ${subject}`, html)

  if (!res.ok) return NextResponse.json({ error: res.error ?? 'שגיאה בשליחה' }, { status: 500 })
  return NextResponse.json({ success: true, sent_to: row.recipients.length })
}
