import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location_id, report_type, description } = await req.json()
  if (!location_id || !description) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.from('deficiency_reports').insert({
    inspector_id: user.id,
    location_id,
    report_type: (report_type ?? 'deficiency') as 'deficiency' | 'note',
    description,
    admin_status: 'open' as const,
    admin_notes: null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify admins
  try {
    const { data: loc } = await service.from('locations').select('name').eq('id', location_id).single()
    await fetch(`${req.nextUrl.origin}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'דיווח ליקוי חדש',
        body: loc?.name ?? '',
        url: '/admin',
      }),
    })
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true })
}
