import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// An assigned inspector ticks/unticks which checks apply at their location and
// edits each check's note. Writes go through the service role (RLS bypass), so
// authorize by assignment explicitly, and only allow the location's own or the
// global candidate checklist items (never another location's items).

// Tick a check for this location.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location_id, checklist_item_id } = await req.json()
  if (!location_id || !checklist_item_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()
  const { data: assignment } = await service.from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', location_id).maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // The item must be a candidate for this location: its own item, or a global
  // default (location_id IS NULL). Prevents attaching arbitrary items.
  const { data: item } = await service.from('checklist_items')
    .select('id,location_id').eq('id', checklist_item_id).maybeSingle()
  if (!item || (item.location_id !== null && item.location_id !== location_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Guard the UNIQUE(location_id, checklist_item_id): if already ticked, return it.
  const { data: existing } = await service.from('procedure_checks')
    .select('id,note').eq('location_id', location_id).eq('checklist_item_id', checklist_item_id).maybeSingle()
  if (existing) return NextResponse.json({ id: existing.id, note: existing.note })

  const { data, error } = await service.from('procedure_checks')
    .insert({ location_id, checklist_item_id, note: null }).select('id,note').single()
  if (error) return NextResponse.json({ error: 'שגיאה' }, { status: 500 })
  return NextResponse.json({ id: data.id, note: data.note })
}

// Untick a check.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const location_id = req.nextUrl.searchParams.get('location_id')
  const checklist_item_id = req.nextUrl.searchParams.get('checklist_item_id')
  if (!location_id || !checklist_item_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()
  const { data: assignment } = await service.from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', location_id).maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await service.from('procedure_checks')
    .delete().eq('location_id', location_id).eq('checklist_item_id', checklist_item_id)
  if (error) return NextResponse.json({ error: 'שגיאה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Edit a check's per-location note.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location_id, checklist_item_id, note } = await req.json()
  if (!location_id || !checklist_item_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()
  const { data: assignment } = await service.from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', location_id).maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cleaned = typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null
  const { error } = await service.from('procedure_checks')
    .update({ note: cleaned }).eq('location_id', location_id).eq('checklist_item_id', checklist_item_id)
  if (error) return NextResponse.json({ error: 'שגיאה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
