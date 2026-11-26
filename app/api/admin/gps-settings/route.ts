import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { getSettingsRow } from '../report-settings/route'
import type { GpsEnforcement } from '@/lib/supabase/types'

const MODES: GpsEnforcement[] = ['off', 'warn', 'block']

// GPS enforcement for scans lives on the single report_settings row but has its
// own route, so saving the email report settings never overwrites it.
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const row = await getSettingsRow(service)
  return NextResponse.json({ gps_enforcement: row?.gps_enforcement ?? 'warn' })
}

export async function PUT(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const mode = body.gps_enforcement as GpsEnforcement
  if (!MODES.includes(mode)) return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
  const service = createServiceClient()
  const row = await getSettingsRow(service)
  if (!row) return NextResponse.json({ error: 'שגיאה בטעינת ההגדרות' }, { status: 500 })
  const { error } = await service.from('report_settings')
    .update({ gps_enforcement: mode, updated_at: new Date().toISOString() }).eq('id', row.id)
  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ gps_enforcement: mode })
}
