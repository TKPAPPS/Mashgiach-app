import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

  if (from && ISO_DATE_RE.test(from)) q = q.gte('visit_date', from)
  if (to   && ISO_DATE_RE.test(to))   q = q.lte('visit_date', to)
  if (location_id) q = q.eq('location_id', location_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'שגיאה בטעינת הדוחות' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { location_id, title, body, visit_date } = await req.json()
  if (!location_id || !title?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const safeDate = ISO_DATE_RE.test(visit_date ?? '') ? visit_date : new Date().toISOString().slice(0, 10)

  const service = createServiceClient()
  const { data, error } = await service.from('admin_location_reports').insert({
    location_id,
    admin_id: user.id,
    title: String(title).trim().slice(0, 500),
    body: body ? String(body).trim().slice(0, 20000) : null,
    visit_date: safeDate,
  }).select('*, location:locations(id,name,city,address), admin:profiles(id,full_name)').single()

  if (error) return NextResponse.json({ error: 'שגיאה בשמירת הדוח' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, title, body, visit_date } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (title !== undefined && !String(title).trim()) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }

  const safeDate = ISO_DATE_RE.test(visit_date ?? '') ? visit_date : undefined

  const service = createServiceClient()
  const { data, error } = await service.from('admin_location_reports').update({
    ...(title !== undefined && { title: String(title).trim().slice(0, 500) }),
    ...(body !== undefined && { body: body ? String(body).trim().slice(0, 20000) : null }),
    ...(safeDate && { visit_date: safeDate }),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('admin_id', user.id)
    .select('*, location:locations(id,name,city,address), admin:profiles(id,full_name)').single()

  if (error) return NextResponse.json({ error: 'שגיאה בעדכון הדוח' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()

  // Delete storage files for all attachments first
  const { data: attachments } = await service
    .from('admin_report_attachments')
    .select('file_path')
    .eq('report_id', id)
  if (attachments && attachments.length > 0) {
    await service.storage.from('admin-reports').remove(attachments.map(a => a.file_path))
  }

  // Scope delete to admin_id so admins can only delete their own reports
  const { error } = await service.from('admin_location_reports').delete().eq('id', id).eq('admin_id', user.id)
  if (error) return NextResponse.json({ error: 'שגיאה במחיקת הדוח' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
