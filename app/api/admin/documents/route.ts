import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import sharp from 'sharp'

const BUCKET = 'documents'
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

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const { data } = await service.from('documents')
    .select('id,name,file_path,file_name,file_type,location_id,inspector_id,created_at')
    .order('created_at', { ascending: false })

  const result = await Promise.all((data ?? []).map(async (d) => {
    // Documents download; images render inline.
    const opts = d.file_type === 'document' ? { download: d.file_name } : {}
    const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(d.file_path, 3600, opts)
    return { ...d, url: signed?.signedUrl ?? null }
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const name = (form.get('name') as string | null)?.trim()
  const location_id = (form.get('location_id') as string | null) || null
  const inspector_id = (form.get('inspector_id') as string | null) || null
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` }, { status: 413 })
  }

  const mimeType = file.type.toLowerCase().split(';')[0].trim()
  const ext = ALLOWED_MIME_TYPES[mimeType]
  if (!ext) return NextResponse.json({ error: 'File type not allowed' }, { status: 415 })

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

  const path = `${fileId}.${finalExt}`
  const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, uploadBuffer, { contentType, upsert: false })
  if (uploadErr) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: doc, error: dbErr } = await service.from('documents').insert({
    name: name || file.name.slice(0, 255),
    file_path: path,
    file_name: file.name.slice(0, 255),
    file_type: isImage ? 'image' : 'document',
    location_id,
    inspector_id,
    uploaded_by: user.id,
  }).select('id,name,file_path,file_name,file_type,location_id,inspector_id,created_at').single()

  if (dbErr) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: 'שגיאה בשמירת המסמך' }, { status: 500 })
  }

  const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, 3600)
  return NextResponse.json({ ...doc, url: signed?.signedUrl ?? null })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Deletion is intentionally NOT scoped to uploaded_by: the documents library is
  // a shared organizational resource (contracts any admin may need to manage),
  // unlike admin reports which are per-author. Any admin may remove any document.
  const service = createServiceClient()
  const { data: doc } = await service.from('documents').select('file_path').eq('id', id).single()
  if (!doc) return NextResponse.json({ ok: true })

  // Delete DB row first; an orphaned blob is inaccessible (no signed URL), the
  // reverse order risks a dangling row pointing at deleted storage.
  const { error: dbErr } = await service.from('documents').delete().eq('id', id)
  if (dbErr) return NextResponse.json({ error: 'שגיאה במחיקת המסמך' }, { status: 500 })

  await service.storage.from(BUCKET).remove([doc.file_path])
  return NextResponse.json({ ok: true })
}
