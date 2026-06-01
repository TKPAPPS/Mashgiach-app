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

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const { data } = await service.from('checklist_items').select('*').order('sort_order')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, sort_order, active } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  const service = createServiceClient()
  const { error, data } = await service.from('checklist_items').insert({
    name: String(name).trim().slice(0, 500),
    sort_order: typeof sort_order === 'number' ? Math.round(sort_order) : 0,
    active: active !== false,
  }).select().single()
  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, name, sort_order, active } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const updates: Partial<{ name: string; sort_order: number; active: boolean }> = {}
  if (name !== undefined) updates.name = String(name).trim().slice(0, 500)
  if (sort_order !== undefined) updates.sort_order = Math.round(Number(sort_order))
  if (active !== undefined) updates.active = Boolean(active)
  const service = createServiceClient()
  const { error, data } = await service.from('checklist_items').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const service = createServiceClient()
  await service.from('checklist_items').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
