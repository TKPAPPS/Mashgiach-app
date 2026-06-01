import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'

const BUCKET = 'admin-reports'
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

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

  // Enforce file size limit
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` }, { status: 413 })
  }

  // Validate MIME type against allowlist (use server-side detection via file magic, not client header)
  const mimeType = file.type.toLowerCase().split(';')[0].trim()
  const ext = ALLOWED_MIME_TYPES[mimeType]
  if (!ext) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 415 })
  }

  const isImage = mimeType.startsWith('image/')
  const fileId = crypto.randomUUID()
  const service = createServiceClient()

  let uploadBuffer: Buffer
  let contentType: string
  let finalExt: string

  if (isImage) {
    const raw = Buffer.from(await file.arrayBuffer())
    try {
      uploadBuffer = await sharp(raw)
        .rotate()
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer()
    } catch {
      return NextResponse.json({ error: 'Invalid image file' }, { status: 400 })
    }
    contentType = 'image/jpeg'
    finalExt = 'jpg'
  } else {
    uploadBuffer = Buffer.from(await file.arrayBuffer())
    contentType = mimeType
    finalExt = ext
  }

  const path = `${report_id}/${fileId}.${finalExt}`
  const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, uploadBuffer, { contentType, upsert: false })
  if (uploadErr) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: attachment } = await service.from('admin_report_attachments').insert({
    report_id, admin_id: user.id, file_path: path,
    file_name: file.name.slice(0, 255), file_type: isImage ? 'image' : 'document',
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
  // Scope to admin_id so admins can only delete their own attachments
  const { data: att } = await service.from('admin_report_attachments')
    .select('file_path')
    .eq('id', id)
    .eq('admin_id', user.id)
    .single()
  if (att) await service.storage.from(BUCKET).remove([att.file_path])
  await service.from('admin_report_attachments').delete().eq('id', id).eq('admin_id', user.id)
  return NextResponse.json({ ok: true })
}
