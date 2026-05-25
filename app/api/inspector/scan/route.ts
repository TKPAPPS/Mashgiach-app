import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { distanceMeters, GPS_THRESHOLD_METERS } from '@/lib/utils/gps'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qr_code, lat, lng } = await req.json()
  if (!qr_code) return NextResponse.json({ error: 'Missing QR code' }, { status: 400 })

  // Look up location by QR code
  const { data: location } = await service
    .from('locations')
    .select('*')
    .eq('qr_code', qr_code.trim())
    .eq('status', 'active')
    .single()

  if (!location) {
    // Log the failed attempt
    await service.from('visit_logs').insert({
      inspector_id: user.id,
      location_id: null,
      action_type: 'entry',
      device_lat: lat ?? null,
      device_lng: lng ?? null,
      distance_meters: null,
      internal_status: 'invalid_location',
      qr_code_scanned: qr_code,
    })
    // Inspector always sees generic success message
    return NextResponse.json({ success: true, action_type: 'entry', message: 'ok' })
  }

  // Check inspector is assigned to this location
  const { data: assignment } = await service
    .from('inspector_locations')
    .select('id')
    .eq('inspector_id', user.id)
    .eq('location_id', location.id)
    .single()

  if (!assignment) {
    await service.from('visit_logs').insert({
      inspector_id: user.id,
      location_id: location.id,
      action_type: 'entry',
      device_lat: lat ?? null,
      device_lng: lng ?? null,
      distance_meters: null,
      internal_status: 'unauthorized',
      qr_code_scanned: qr_code,
    })
    return NextResponse.json({ success: true, action_type: 'entry', location_name: location.name, message: 'ok' })
  }

  // Determine entry or exit based on last log
  const { data: lastLog } = await service
    .from('visit_logs')
    .select('action_type')
    .eq('inspector_id', user.id)
    .eq('location_id', location.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const action_type = (!lastLog || lastLog.action_type === 'exit') ? 'entry' : 'exit'

  // GPS validation
  let distance: number | null = null
  let gps_status: 'success' | 'gps_mismatch' = 'success'

  if (lat != null && lng != null && location.lat != null && location.lng != null) {
    distance = Math.round(distanceMeters(lat, lng, location.lat, location.lng))
    if (distance > GPS_THRESHOLD_METERS) {
      gps_status = 'gps_mismatch'
    }
  }

  const { data: visitLog } = await service.from('visit_logs').insert({
    inspector_id: user.id,
    location_id: location.id,
    action_type,
    device_lat: lat ?? null,
    device_lng: lng ?? null,
    distance_meters: distance,
    internal_status: gps_status,
    qr_code_scanned: qr_code,
  }).select().single()

  // Create GPS alert if mismatch
  if (gps_status === 'gps_mismatch' && visitLog) {
    await service.from('gps_alerts').insert({
      visit_log_id: visitLog.id,
      inspector_id: user.id,
      location_id: location.id,
      action_type,
      distance_meters: distance,
      read: false,
    })
  }

  // Log to system_logs
  await service.from('system_logs').insert({
    action_type: `visit_${action_type}`,
    performed_by: user.id,
    location_id: location.id,
    details: { qr_code, distance_meters: distance, gps_status },
    status: 'success',
  })

  // Send push notification to admins
  try {
    await fetch(`${req.nextUrl.origin}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: action_type === 'entry' ? 'כניסה חדשה' : 'יציאה חדשה',
        body: `${location.name}`,
        url: '/admin',
      }),
    })
  } catch {
    // Non-fatal
  }

  // Always return generic success to inspector
  return NextResponse.json({ success: true, action_type, location_name: location.name })
}
