import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { listMenuFiles, addMenuFile, deleteMenuFile, menuFileLocation } from '@/lib/utils/menuFiles'

// The inspector ASSIGNED to a location can view and edit its menu files
// (same model as the work procedure photos).
async function assignedInspectorId(location_id: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createServiceClient().from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', location_id).maybeSingle()
  return data ? user.id : null
}

export async function GET(req: NextRequest) {
  const location_id = req.nextUrl.searchParams.get('location_id')
  if (!location_id) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })
  if (!await assignedInspectorId(location_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await listMenuFiles(createServiceClient(), location_id))
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const location_id = form.get('location_id') as string | null
  const file = form.get('file') as File | null
  if (!location_id || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const uid = await assignedInspectorId(location_id)
  if (!uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const r = await addMenuFile(createServiceClient(), location_id, file, uid)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r.file)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const service = createServiceClient()
  const location_id = await menuFileLocation(service, id)
  if (!location_id) return NextResponse.json({ ok: true })
  if (!await assignedInspectorId(location_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const r = await deleteMenuFile(service, id)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json({ ok: true })
}
