import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { request_type, start_date, end_date, location_id, replacement_inspector_id, notes } = await req.json()
  if (!request_type) return NextResponse.json({ error: 'Missing request_type' }, { status: 400 })

  const service = await createServiceClient()
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
  return NextResponse.json({ success: true })
}
