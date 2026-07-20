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

  // Inspector must be assigned to this location (the route uses the service role,
  // which bypasses RLS, so authorize explicitly).
  const { data: assignment } = await service.from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', location_id).maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: location } = await service.from('locations')
    .select('id,name,opening_hours,inspector_arrival_time,working_days,kashrus_procedure')
    .eq('id', location_id).single()
  if (!location) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only the checks the manager ticked into this location's procedure, with the
  // per-location note. Joined to checklist_items for the name + frequency.
  const { data: pc } = await service.from('procedure_checks')
    .select('note, checklist_item:checklist_items(id,name,frequency,sort_order)')
    .eq('location_id', location_id)
  type PcRow = { note: string | null; checklist_item: { id: string; name: string; frequency: string; sort_order: number } | null }
  const checks = ((pc ?? []) as unknown as PcRow[])
    .map((r) => {
      const ci = r.checklist_item
      return ci ? { id: ci.id, checklist_item_id: ci.id, name: ci.name, frequency: ci.frequency, note: r.note, sort_order: ci.sort_order } : null
    })
    .filter((x): x is { id: string; checklist_item_id: string; name: string; frequency: string; note: string | null; sort_order: number } => x !== null)
    .sort((a, b) => a.sort_order - b.sort_order)

  const { data: photoRows } = await service.from('procedure_photos')
    .select('id,note,photo_path,sort_order,created_at')
    .eq('location_id', location_id).order('sort_order').order('created_at')
  const photos = await Promise.all((photoRows ?? []).map(async (p) => {
    const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    return { id: p.id, note: p.note, url: signed?.signedUrl ?? null }
  }))

  return NextResponse.json({ location, checks, photos })
}

// An assigned inspector edits the procedure fields (hours, required arrival
// time, working days, and the general kashrut procedure text). Same per-location
// data the admin tab edits. Only the keys present in the body are updated, so
// saving one card never clears another card's fields.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const location_id = body.location_id as string | undefined
  if (!location_id) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })

  const service = createServiceClient()
  const { data: assignment } = await service.from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', location_id).maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clean = (v: unknown, max: number) => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null }
  const update: {
    opening_hours?: string | null
    inspector_arrival_time?: string | null
    working_days?: string | null
    kashrus_procedure?: string | null
  } = {}
  if ('opening_hours' in body) update.opening_hours = clean(body.opening_hours, 200)
  if ('inspector_arrival_time' in body) update.inspector_arrival_time = clean(body.inspector_arrival_time, 200)
  if ('working_days' in body) update.working_days = clean(body.working_days, 200)
  if ('kashrus_procedure' in body) update.kashrus_procedure = clean(body.kashrus_procedure, 5000)
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await service.from('locations').update(update)
    .eq('id', location_id).select('opening_hours,inspector_arrival_time,working_days,kashrus_procedure').single()
  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })

  return NextResponse.json(data)
}
