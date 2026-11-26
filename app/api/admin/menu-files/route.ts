import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { listMenuFiles, addMenuFile, deleteMenuFile } from '@/lib/utils/menuFiles'

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const location_id = req.nextUrl.searchParams.get('location_id')
  if (!location_id) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })
  return NextResponse.json(await listMenuFiles(createServiceClient(), location_id))
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const form = await req.formData()
  const location_id = form.get('location_id') as string | null
  const file = form.get('file') as File | null
  if (!location_id || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const r = await addMenuFile(createServiceClient(), location_id, file, admin.id)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r.file)
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const r = await deleteMenuFile(createServiceClient(), id)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json({ ok: true })
}
