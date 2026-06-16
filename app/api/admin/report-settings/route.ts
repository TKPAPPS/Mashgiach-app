import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import type { ReportSection } from '@/lib/supabase/types'

const VALID_SECTIONS: ReportSection[] = ['summary', 'time_per_restaurant', 'deficiencies', 'checklist_details']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Loads the single config row, seeding one if the table is somehow empty.
export async function getSettingsRow(service: ReturnType<typeof createServiceClient>) {
  const { data } = await service.from('report_settings').select('*').limit(1).maybeSingle()
  if (data) return data
  const { data: created } = await service.from('report_settings').insert({ enabled: false }).select().single()
  return created
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const row = await getSettingsRow(service)
  return NextResponse.json({ settings: row })
}

export async function PUT(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const enabled = !!body.enabled
  const send_time = typeof body.send_time === 'string' && TIME_RE.test(body.send_time) ? body.send_time : '10:00'

  const recipients = Array.isArray(body.recipients)
    ? [...new Set((body.recipients as unknown[]).map(r => String(r).trim()).filter(r => EMAIL_RE.test(r)))]
    : []

  const sections = Array.isArray(body.sections)
    ? (body.sections as unknown[]).map(String).filter((s): s is ReportSection => VALID_SECTIONS.includes(s as ReportSection))
    : []

  if (enabled && recipients.length === 0) {
    return NextResponse.json({ error: 'יש להזין לפחות נמען אחד תקין' }, { status: 400 })
  }

  const service = createServiceClient()
  const row = await getSettingsRow(service)
  if (!row) return NextResponse.json({ error: 'שגיאה בטעינת ההגדרות' }, { status: 500 })

  const { data, error } = await service.from('report_settings')
    .update({ enabled, send_time, recipients, sections, updated_at: new Date().toISOString() })
    .eq('id', row.id).select().single()

  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ settings: data })
}
