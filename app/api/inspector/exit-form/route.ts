import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VISIT_LOG_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { visit_log_id, location_id, checks } = body

  if (!visit_log_id || !location_id || !Array.isArray(checks)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify the visit_log exists, belongs to this inspector, is an exit, and matches the location
  const { data: visitLog } = await service
    .from('visit_logs')
    .select('id, inspector_id, location_id, action_type, created_at')
    .eq('id', visit_log_id)
    .single()

  if (!visitLog) {
    return NextResponse.json({ error: 'Visit log not found' }, { status: 404 })
  }
  if (visitLog.inspector_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (visitLog.action_type !== 'exit') {
    return NextResponse.json({ error: 'Visit log is not an exit' }, { status: 400 })
  }
  if (visitLog.location_id !== location_id) {
    return NextResponse.json({ error: 'Location mismatch' }, { status: 400 })
  }

  // Reject submissions for visit logs older than 24 hours
  const ageMs = Date.now() - new Date(visitLog.created_at).getTime()
  if (ageMs > VISIT_LOG_MAX_AGE_MS) {
    return NextResponse.json({ error: 'Visit log expired' }, { status: 400 })
  }

  // Verify inspector is assigned to this location
  const { data: assignment } = await service
    .from('inspector_locations')
    .select('id')
    .eq('inspector_id', user.id)
    .eq('location_id', location_id)
    .single()

  if (!assignment) {
    return NextResponse.json({ error: 'Inspector not assigned to this location' }, { status: 403 })
  }

  // Idempotent: delete any prior visit_checks for this visit_log before inserting
  await service.from('visit_checks').delete().eq('visit_log_id', visit_log_id)

  // Insert only if there are checked items (empty submission is valid)
  if (checks.length > 0) {
    const rows = checks.map((c: { checklist_item_id?: string; item_name?: string; note?: string }) => ({
      visit_log_id,
      inspector_id: user.id,
      location_id,
      checklist_item_id: c.checklist_item_id ?? null,
      item_name: c.item_name ?? null,
      note: c.note ?? null,
    }))
    const { error } = await service.from('visit_checks').insert(rows)
    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הבדיקות' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
