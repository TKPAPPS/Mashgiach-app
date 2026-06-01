import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/utils/notifyAdmins'

const VALID_REPORT_TYPES = ['deficiency', 'note'] as const

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location_id, report_type, description } = await req.json()
  if (!location_id || !description?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const validType = VALID_REPORT_TYPES.includes(report_type) ? report_type : 'deficiency'

  const service = createServiceClient()

  // Validate inspector is assigned to this location
  const { data: assignment } = await service
    .from('inspector_locations')
    .select('id')
    .eq('inspector_id', user.id)
    .eq('location_id', location_id)
    .single()

  if (!assignment) {
    return NextResponse.json({ error: 'Not assigned to this location' }, { status: 403 })
  }

  const { data: report, error } = await service.from('deficiency_reports').insert({
    inspector_id: user.id,
    location_id,
    report_type: validType,
    description: String(description).trim().slice(0, 5000),
    admin_status: 'open' as const,
    admin_notes: null,
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'שגיאה בשליחת הדיווח' }, { status: 500 })

  // Notify admins
  try {
    const { data: loc } = await service.from('locations').select('name').eq('id', location_id).single()
    await notifyAdmins({ title: 'דיווח ליקוי חדש', body: loc?.name ?? '', url: '/admin' })
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, report_id: report?.id ?? null })
}
