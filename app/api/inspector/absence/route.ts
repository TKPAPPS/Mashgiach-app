import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { request_type, start_date, end_date, location_id, replacement_inspector_id, notes } = await req.json()
  if (!request_type) return NextResponse.json({ error: 'Missing request_type' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.from('absence_requests').insert({
    inspector_id: user.id,
    request_type,
    start_date: start_date || null,
    end_date: end_date || null,
    location_id: location_id || null,
    replacement_inspector_id: replacement_inspector_id || null,
    notes: notes || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify admins — non-fatal, mirrors the report route pattern
  try {
    const typeLabels: Record<string, string> = {
      vacation: 'חופשה', absence: 'היעדרות', replacement: 'החלפה', other: 'אחר',
    }
    const { data: inspector } = await service.from('profiles').select('full_name').eq('id', user.id).single()
    await fetch(`${req.nextUrl.origin}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'בקשת היעדרות חדשה',
        body: `${inspector?.full_name ?? ''} — ${typeLabels[request_type] ?? request_type}`,
        url: '/admin',
      }),
    })
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true })
}
