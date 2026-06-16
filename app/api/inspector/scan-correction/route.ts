import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/utils/notifyAdmins'

// Inspector reports a forgotten check-out: submits the location and estimated
// entry/exit times. Stored as a pending scan_correction for an admin to approve
// (approval creates the matching visit_logs). No visit_logs are touched here.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location_id, est_entry, est_exit, note } = await req.json()
  if (!location_id) return NextResponse.json({ error: 'חסר מקום' }, { status: 400 })

  // datetime-local sends wall-clock with no zone; inspectors are in Bangkok, so
  // interpret the entered time as Asia/Bangkok (UTC+7) regardless of server zone.
  const parseBangkok = (s: unknown): number => {
    if (typeof s !== 'string') return NaN
    const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/)
    if (!m) return NaN
    return Date.parse(`${m[2] ? s : `${s}:00`}+07:00`)
  }

  const entryMs = parseBangkok(est_entry)
  const exitMs = parseBangkok(est_exit)
  if (isNaN(entryMs) || isNaN(exitMs)) {
    return NextResponse.json({ error: 'זמנים לא תקינים' }, { status: 400 })
  }
  if (exitMs <= entryMs) {
    return NextResponse.json({ error: 'זמן היציאה חייב להיות אחרי זמן הכניסה' }, { status: 400 })
  }
  if (entryMs > Date.now() + 60_000) {
    return NextResponse.json({ error: 'לא ניתן לדווח על זמן עתידי' }, { status: 400 })
  }

  const service = createServiceClient()

  // Inspector must be assigned to this location.
  const { data: assignment } = await service
    .from('inspector_locations')
    .select('id')
    .eq('inspector_id', user.id)
    .eq('location_id', location_id)
    .single()
  if (!assignment) return NextResponse.json({ error: 'אינך משויך למקום זה' }, { status: 403 })

  const { error } = await service.from('scan_corrections').insert({
    inspector_id: user.id,
    location_id,
    est_entry: new Date(entryMs).toISOString(),
    est_exit: new Date(exitMs).toISOString(),
    note: note ? String(note).trim().slice(0, 2000) : null,
  })
  if (error) return NextResponse.json({ error: 'שגיאה בשליחת הבקשה' }, { status: 500 })

  try {
    const [{ data: inspector }, { data: location }] = await Promise.all([
      service.from('profiles').select('full_name').eq('id', user.id).single(),
      service.from('locations').select('name').eq('id', location_id).single(),
    ])
    await notifyAdmins({
      title: 'בקשת תיקון סריקה',
      body: `${inspector?.full_name ?? ''}, ${location?.name ?? ''}`,
      url: '/admin',
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true })
}
