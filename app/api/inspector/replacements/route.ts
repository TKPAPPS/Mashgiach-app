import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const locationId = req.nextUrl.searchParams.get('location_id')
  if (!locationId) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })

  const service = createServiceClient()

  // Verify the requesting inspector is assigned to this location
  const { data: assignment } = await service
    .from('inspector_locations')
    .select('id')
    .eq('inspector_id', user.id)
    .eq('location_id', locationId)
    .single()

  if (!assignment) return NextResponse.json({ error: 'Not assigned to this location' }, { status: 403 })

  // Get all other inspector IDs assigned to the same location
  const { data: ilRows } = await service
    .from('inspector_locations')
    .select('inspector_id')
    .eq('location_id', locationId)
    .neq('inspector_id', user.id)

  if (!ilRows || ilRows.length === 0) return NextResponse.json({ inspectors: [] })

  const ids = ilRows.map((r: { inspector_id: string }) => r.inspector_id)
  const { data: profiles } = await service
    .from('profiles')
    .select('id,full_name')
    .in('id', ids)
    .order('full_name')

  return NextResponse.json({ inspectors: profiles ?? [] })
}
