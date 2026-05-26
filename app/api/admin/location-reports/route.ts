import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const location_id = req.nextUrl.searchParams.get('location_id')

  let q = service
    .from('admin_location_reports')
    .select('*, location:locations(id,name,city,address), admin:profiles(id,full_name)')
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (from) q = q.gte('visit_date', from)
  if (to) q = q.lte('visit_date', to)
  if (location_id) q = q.eq('location_id', location_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { location_id, title, body, visit_date } = await req.json()
  if (!location_id || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service.from('admin_location_reports').insert({
    location_id, admin_id: user.id, title, body: body || null,
    visit_date: visit_date || new Date().toISOString().slice(0, 10),
  }).select('*, location:locations(id,name,city,address), admin:profiles(id,full_name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, title, body, visit_date } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service.from('admin_location_reports').update({
    title, body: body ?? null, visit_date,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*, location:locations(id,name,city,address), admin:profiles(id,full_name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.from('admin_location_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
