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
    .select('id,report_id,text,completed,completed_at,created_at')
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
    .insert({ report_id, text: String(text).trim().slice(0, 1000), completed: false, completed_at: null })
    .select('id,report_id,text,completed,completed_at,created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, text, completed } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const updates: Partial<{ text: string; completed: boolean; completed_at: string | null }> = {}
  if (text !== undefined) updates.text = String(text).trim().slice(0, 1000)
  if (completed !== undefined) {
    updates.completed = completed
    updates.completed_at = completed ? new Date().toISOString() : null
  }

  const { data, error } = await service
    .from('admin_report_followups')
    .update(updates)
    .eq('id', id)
    .select('id,report_id,text,completed,completed_at,created_at')
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
