import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Settings the inspector app needs to draw its screens (read only).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: row } = await service.from('report_settings').select('location_checkin_enabled,require_proof_photo').limit(1).maybeSingle()
  return NextResponse.json({
    location_checkin_enabled: row?.location_checkin_enabled !== false,
    require_proof_photo: row?.require_proof_photo === true,
  })
}
