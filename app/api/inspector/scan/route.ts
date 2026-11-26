import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  evaluateGps, impossibleTravel, MAX_VISIT_HOURS, SCAN_DEBOUNCE_MS, IMPOSSIBLE_TRAVEL_WINDOW_H,
  type GpsCheck, type GpsEnforcement,
} from '@/lib/utils/gps'
import { notifyAdmins } from '@/lib/utils/notifyAdmins'
import type { VisitStatus } from '@/lib/supabase/types'

// Rows that count as a real visit. Rejected, unauthorized and invalid scans are
// kept for the audit trail but never drive the entry/exit toggle.
const COUNTED_STATUSES: VisitStatus[] = ['success', 'gps_mismatch']

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only inspectors (role 'mashgiach') may record visits.
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mashgiach') {
    return NextResponse.json({ success: false, code: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const qr_code = typeof body.qr_code === 'string' ? body.qr_code.trim() : ''
  if (!qr_code) return NextResponse.json({ error: 'Missing QR code' }, { status: 400 })

  const lat = num(body.lat)
  const lng = num(body.lng)
  const rawAcc = num(body.accuracy)
  const accuracy_m = rawAcc != null && rawAcc >= 0 ? rawAcc : null
  const gps_error = typeof body.gps_error === 'string' ? body.gps_error.slice(0, 40) : null

  // Times are always the database's now(); the client never sends a timestamp.
  const baseRow = {
    inspector_id: user.id,
    device_lat: lat,
    device_lng: lng,
    device_accuracy_m: accuracy_m,
    qr_code_scanned: qr_code,
  }

  const { data: location } = await service
    .from('locations')
    .select('id,name,lat,lng')
    .eq('qr_code', qr_code)
    .eq('status', 'active')
    .single()

  if (!location) {
    await service.from('visit_logs').insert({
      ...baseRow, location_id: null, action_type: 'entry', distance_meters: null, internal_status: 'invalid_location',
    })
    return NextResponse.json({ success: false, code: 'invalid_qr' })
  }

  const { data: assignment } = await service
    .from('inspector_locations')
    .select('id')
    .eq('inspector_id', user.id)
    .eq('location_id', location.id)
    .single()

  if (!assignment) {
    await service.from('visit_logs').insert({
      ...baseRow, location_id: location.id, action_type: 'entry', distance_meters: null, internal_status: 'unauthorized',
    })
    return NextResponse.json({ success: false, code: 'unauthorized' })
  }

  // Entry or exit: based only on the last counted visit row.
  const { data: lastLog } = await service
    .from('visit_logs')
    .select('id,action_type,created_at')
    .eq('inspector_id', user.id)
    .eq('location_id', location.id)
    .in('internal_status', COUNTED_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastAgeMs = lastLog ? Date.now() - new Date(lastLog.created_at).getTime() : Infinity

  // A rescan seconds after the last one: return that visit, create nothing.
  if (lastLog && lastAgeMs < SCAN_DEBOUNCE_MS) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      action_type: lastLog.action_type,
      location_name: location.name,
      location_id: location.id,
      visit_log_id: lastLog.id,
      has_checklist: lastLog.action_type === 'exit' ? await hasChecklist(service) : false,
    })
  }

  // A stale open entry (forgot to scan out) is left unclosed; this scan opens a new visit.
  const action_type: 'entry' | 'exit' =
    (!lastLog || lastLog.action_type === 'exit' || lastAgeMs > MAX_VISIT_HOURS * 3600_000) ? 'entry' : 'exit'

  const { check: gps_check, distance } = evaluateGps(
    { lat, lng, accuracy: accuracy_m },
    { lat: location.lat, lng: location.lng },
  )

  const { data: settings } = await service.from('report_settings').select('gps_enforcement').limit(1).maybeSingle()
  const enforcement: GpsEnforcement = (settings?.gps_enforcement as GpsEnforcement | undefined) ?? 'warn'

  const failed = gps_check !== 'ok'
  const rejected = failed && enforcement === 'block'

  let internal_status: 'success' | 'gps_mismatch' | 'gps_rejected' = 'success'
  if (rejected) internal_status = 'gps_rejected'
  else if (gps_check === 'too_far') internal_status = 'gps_mismatch'

  const { data: visitLog, error: insertError } = await service.from('visit_logs').insert({
    ...baseRow,
    location_id: location.id,
    action_type,
    distance_meters: distance,
    internal_status,
    gps_check,
  }).select('id').single()

  // Never report a scan as recorded when the row was not written.
  if (insertError || !visitLog) {
    return NextResponse.json({ success: false, code: 'error' }, { status: 500 })
  }

  // Alerts: always for a far scan; for other failures only when the scan was blocked
  // (in warn mode a missing GPS is flagged on the row itself, not as an alert).
  if (gps_check === 'too_far' || rejected) {
    await service.from('gps_alerts').insert({
      visit_log_id: visitLog.id,
      inspector_id: user.id,
      location_id: location.id,
      action_type,
      distance_meters: distance,
      alert_type: alertType(gps_check),
      read: false,
    })
  }

  // Impossible travel: compare with this inspector's previous scan that had a
  // location (any restaurant, any status). Recorded as its own alert.
  if (lat != null && lng != null) {
    const since = new Date(Date.now() - IMPOSSIBLE_TRAVEL_WINDOW_H * 3600_000).toISOString()
    const { data: prev } = await service.from('visit_logs')
      .select('device_lat,device_lng,created_at')
      .eq('inspector_id', user.id).neq('id', visitLog.id)
      .not('device_lat', 'is', null).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const jump = prev?.device_lat != null && prev.device_lng != null
      ? impossibleTravel({ lat: prev.device_lat, lng: prev.device_lng, at: prev.created_at }, { lat, lng, at: new Date().toISOString() })
      : null
    if (jump) {
      await service.from('gps_alerts').insert({
        visit_log_id: visitLog.id,
        inspector_id: user.id,
        location_id: location.id,
        action_type,
        distance_meters: Math.round(jump.km * 1000),
        alert_type: 'impossible_travel',
        read: false,
      })
      try {
        await notifyAdmins({ title: 'נסיעה בלתי אפשרית', body: `${location.name}: ${Math.round(jump.km)} ק״מ מהסריקה הקודמת`, url: '/admin' })
      } catch { /* non-fatal */ }
    }
  }

  await service.from('system_logs').insert({
    action_type: rejected ? 'visit_rejected' : `visit_${action_type}`,
    performed_by: user.id,
    location_id: location.id,
    details: { qr_code, distance_meters: distance, gps_check, gps_error, enforcement },
    status: rejected ? 'failed' : 'success',
  })

  if (rejected) {
    return NextResponse.json({ success: false, code: gps_check, distance })
  }

  try {
    await notifyAdmins({
      title: action_type === 'entry' ? 'כניסה חדשה' : 'יציאה חדשה',
      body: location.name,
      url: '/admin',
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({
    success: true,
    action_type,
    location_name: location.name,
    location_id: location.id,
    visit_log_id: visitLog.id,
    has_checklist: action_type === 'exit' ? await hasChecklist(service) : false,
    gps_warning: failed ? gps_check : null,
  })
}

function alertType(check: GpsCheck): 'gps_mismatch' | 'no_gps' | 'low_accuracy' | 'location_no_coords' {
  if (check === 'too_far') return 'gps_mismatch'
  if (check === 'ok') return 'gps_mismatch'
  return check
}

async function hasChecklist(service: ReturnType<typeof createServiceClient>) {
  const { count } = await service.from('checklist_items').select('*', { count: 'exact', head: true }).eq('active', true)
  return (count ?? 0) > 0
}
