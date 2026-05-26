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

  const report_id = req.nextUrl.searchParams.get('report_id')
  if (!report_id) return NextResponse.json({ error: 'Missing report_id' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('admin_report_followups')
    .select('id,report_id,admin_id,text,is_done,created_at,updated_at,admin:profiles(id,full_name)')
    .eq('report_id', report_id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { report_id, text } = await req.json()
  if (!report_id || !text?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('admin_report_followups')
    .insert({ report_id, admin_id: user.id, text: text.trim(), is_done: false })
    .select('id,report_id,admin_id,text,is_done,created_at,updated_at,admin:profiles(id,full_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, text, is_done } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const updates: Partial<{ text: string; is_done: boolean; updated_at: string }> = { updated_at: new Date().toISOString() }
  if (text !== undefined) updates.text = text
  if (is_done !== undefined) updates.is_done = is_done

  const { data, error } = await service
    .from('admin_report_followups')
    .update(updates)
    .eq('id', id)
    .select('id,report_id,admin_id,text,is_done,created_at,updated_at,admin:profiles(id,full_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.from('admin_report_followups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
