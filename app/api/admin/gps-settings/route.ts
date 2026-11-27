import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { getSettingsRow } from '../report-settings/route'
import type { GpsEnforcement } from '@/lib/supabase/types'
import { validForgotExitMinutes, FORGOT_EXIT_DEFAULT_MIN } from '@/lib/utils/forgotExit'

const MODES: GpsEnforcement[] = ['off', 'warn', 'block']

// Scan settings (GPS enforcement, forgot-exit reminder) live on the single
// report_settings row but have their own route, so saving the email report
// settings never overwrites them. PUT accepts either field, or both.
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const row = await getSettingsRow(service)
  // How many inspectors can actually receive the reminder (push turned on).
  const { data: inspectors } = await service.from('profiles').select('id').eq('role', 'mashgiach')
  const ids = (inspectors ?? []).map((p: { id: string }) => p.id)
  const { data: subs } = ids.length
    ? await service.from('push_subscriptions').select('user_id').in('user_id', ids)
    : { data: [] as { user_id: string }[] }
  return NextResponse.json({
    gps_enforcement: row?.gps_enforcement ?? 'warn',
    forgot_exit_minutes: row?.forgot_exit_minutes ?? FORGOT_EXIT_DEFAULT_MIN,
    location_checkin_enabled: row?.location_checkin_enabled !== false,
    inspectors_total: ids.length,
    inspectors_with_push: new Set((subs ?? []).map((s: { user_id: string }) => s.user_id)).size,
  })
}

export async function PUT(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const update: { gps_enforcement?: GpsEnforcement; forgot_exit_minutes?: number; location_checkin_enabled?: boolean; updated_at: string } = { updated_at: new Date().toISOString() }
  if ('gps_enforcement' in body) {
    if (!MODES.includes(body.gps_enforcement)) return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
    update.gps_enforcement = body.gps_enforcement
  }
  if ('forgot_exit_minutes' in body) {
    if (!validForgotExitMinutes(body.forgot_exit_minutes)) return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
    update.forgot_exit_minutes = body.forgot_exit_minutes
  }
  if ('location_checkin_enabled' in body) {
    if (typeof body.location_checkin_enabled !== 'boolean') return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
    update.location_checkin_enabled = body.location_checkin_enabled
  }
  if (update.gps_enforcement === undefined && update.forgot_exit_minutes === undefined && update.location_checkin_enabled === undefined) {
    return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
  }
  const service = createServiceClient()
  const row = await getSettingsRow(service)
  if (!row) return NextResponse.json({ error: 'שגיאה בטעינת ההגדרות' }, { status: 500 })
  const { data, error } = await service.from('report_settings')
    .update(update).eq('id', row.id).select('gps_enforcement,forgot_exit_minutes,location_checkin_enabled').single()
  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json(data)
}
