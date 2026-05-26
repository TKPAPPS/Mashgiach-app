import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'

const BUCKET = 'admin-reports'

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
  const { data } = await service.from('admin_report_attachments')
    .select('id,file_path,file_name,file_type,created_at')
    .eq('report_id', report_id).order('created_at')

  const result = await Promise.all((data ?? []).map(async (a) => {
    const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(a.file_path, 3600)
    return { ...a, url: signed?.signedUrl ?? null }
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const report_id = form.get('report_id') as string | null
  const file = form.get('file') as File | null
  if (!report_id || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()
  const isImage = file.type.startsWith('image/')
  const fileId = crypto.randomUUID()
  let uploadBuffer: Buffer
  let contentType: string
  let ext: string

  if (isImage) {
    const raw = Buffer.from(await file.arrayBuffer())
    uploadBuffer = await sharp(raw).rotate().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    contentType = 'image/jpeg'
    ext = 'jpg'
  } else {
    uploadBuffer = Buffer.from(await file.arrayBuffer())
    contentType = file.type
    ext = file.name.split('.').pop() ?? 'bin'
  }

  const path = `${report_id}/${fileId}.${ext}`
  const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, uploadBuffer, { contentType, upsert: false })
  if (uploadErr) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: attachment } = await service.from('admin_report_attachments').insert({
    report_id, admin_id: user.id, file_path: path,
    file_name: file.name, file_type: isImage ? 'image' : 'document',
  }).select('id,file_path,file_name,file_type,created_at').single()

  const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, 3600)
  return NextResponse.json({ ...attachment, url: signed?.signedUrl ?? null })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const { data: att } = await service.from('admin_report_attachments').select('file_path').eq('id', id).single()
  if (att) await service.storage.from(BUCKET).remove([att.file_path])
  await service.from('admin_report_attachments').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
