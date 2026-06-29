import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'procedure-photos'

// Assembles the read-only work & kashrut procedure for a location: the structured
// fields, the location's checklist (per-location with global fallback) plus each
// item's procedure note, and the appliance photos with signed URLs.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const location_id = req.nextUrl.searchParams.get('location_id')
  if (!location_id) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })

  const service = createServiceClient()

  const { data: location } = await service.from('locations')
    .select('id,name,opening_hours,inspector_arrival_time,kashrus_procedure')
    .eq('id', location_id).single()
  if (!location) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Per-location checklist, falling back to the global default list.
  const { data: locItems } = await service.from('checklist_items')
    .select('id,name,frequency,procedure_note,sort_order')
    .eq('active', true).eq('location_id', location_id).order('sort_order')
  let checks = locItems ?? []
  if (checks.length === 0) {
    const { data: globals } = await service.from('checklist_items')
      .select('id,name,frequency,procedure_note,sort_order')
      .eq('active', true).is('location_id', null).order('sort_order')
    checks = globals ?? []
  }

  const { data: photoRows } = await service.from('procedure_photos')
    .select('id,note,photo_path,sort_order,created_at')
    .eq('location_id', location_id).order('sort_order').order('created_at')
  const photos = await Promise.all((photoRows ?? []).map(async (p) => {
    const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    return { id: p.id, note: p.note, url: signed?.signedUrl ?? null }
  }))

  return NextResponse.json({ location, checks, photos })
}
