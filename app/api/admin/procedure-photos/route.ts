import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import sharp from 'sharp'

const BUCKET = 'procedure-photos'
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

// Procedure photos are appliance/oven images; accept images only and re-encode.
export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const location_id = req.nextUrl.searchParams.get('location_id')
  if (!location_id) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })

  const service = createServiceClient()
  const { data } = await service.from('procedure_photos')
    .select('id,location_id,photo_path,note,sort_order,created_at')
    .eq('location_id', location_id).order('sort_order').order('created_at')

  const result = await Promise.all((data ?? []).map(async (p) => {
    const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    return { ...p, url: signed?.signedUrl ?? null }
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const location_id = form.get('location_id') as string | null
  const file = form.get('file') as File | null
  const note = (form.get('note') as string | null)?.trim() || null
  if (!location_id || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` }, { status: 413 })
  }
  if (!file.type.toLowerCase().startsWith('image/')) {
    return NextResponse.json({ error: 'יש להעלות תמונה בלבד' }, { status: 415 })
  }

  const service = createServiceClient()

  let uploadBuffer: Buffer
  try {
    uploadBuffer = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'קובץ תמונה לא תקין' }, { status: 400 })
  }

  const { data: last } = await service.from('procedure_photos')
    .select('sort_order').eq('location_id', location_id).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sort_order = (last?.sort_order ?? 0) + 1

  const path = `${location_id}/${crypto.randomUUID()}.jpg`
  const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, uploadBuffer, { contentType: 'image/jpeg', upsert: false })
  if (uploadErr) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: photo, error: dbErr } = await service.from('procedure_photos').insert({
    location_id, photo_path: path, note, sort_order,
  }).select('id,location_id,photo_path,note,sort_order,created_at').single()

  if (dbErr) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: 'שגיאה בשמירת התמונה' }, { status: 500 })
  }

  const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, 3600)
  return NextResponse.json({ ...photo, url: signed?.signedUrl ?? null })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const { data: photo } = await service.from('procedure_photos').select('photo_path').eq('id', id).single()
  if (!photo) return NextResponse.json({ ok: true })

  const { error: dbErr } = await service.from('procedure_photos').delete().eq('id', id)
  if (dbErr) return NextResponse.json({ error: 'שגיאה במחיקת התמונה' }, { status: 500 })

  await service.storage.from(BUCKET).remove([photo.photo_path])
  return NextResponse.json({ ok: true })
}

// PATCH a photo's note.
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, note } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.from('procedure_photos')
    .update({ note: note != null ? String(note).slice(0, 1000) : null }).eq('id', id)
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון ההערה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
