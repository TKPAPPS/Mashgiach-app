import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'

const BUCKET = 'visit-photos'
const MAX_PHOTOS = 10
const MAX_DIM = 1920
const JPEG_QUALITY = 80

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const visit_log_id = req.nextUrl.searchParams.get('visit_log_id')
  if (!visit_log_id) return NextResponse.json({ error: 'Missing visit_log_id' }, { status: 400 })

  const service = createServiceClient()

  // Verify inspector owns this visit log
  const { data: log } = await service.from('visit_logs').select('id').eq('id', visit_log_id).eq('inspector_id', user.id).single()
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: photos } = await service.from('visit_photos').select('id,photo_path,created_at').eq('visit_log_id', visit_log_id).order('created_at')

  const result = await Promise.all((photos ?? []).map(async (p) => {
    const { data } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    return { id: p.id, url: data?.signedUrl ?? null, created_at: p.created_at }
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const visit_log_id = form.get('visit_log_id') as string | null
  const file = form.get('file') as File | null

  if (!visit_log_id || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()

  // Verify inspector owns this visit log
  const { data: log } = await service.from('visit_logs').select('id,location_id').eq('id', visit_log_id).eq('inspector_id', user.id).single()
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Enforce max 10 photos per visit
  const { count } = await service.from('visit_photos').select('*', { count: 'exact', head: true }).eq('visit_log_id', visit_log_id)
  if ((count ?? 0) >= MAX_PHOTOS) return NextResponse.json({ error: 'max_photos', message: 'הגעת למקסימום 10 תמונות לביקור' }, { status: 400 })

  // Optimize with sharp: resize + JPEG compress
  const buffer = Buffer.from(await file.arrayBuffer())
  const optimized = await sharp(buffer)
    .rotate()
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer()

  const photoId = crypto.randomUUID()
  const path = `${user.id}/${visit_log_id}/${photoId}.jpg`

  const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, optimized, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (uploadErr) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: photo } = await service.from('visit_photos').insert({
    visit_log_id,
    inspector_id: user.id,
    location_id: log.location_id ?? null,
    photo_path: path,
  }).select('id,photo_path,created_at').single()

  const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, 3600)

  return NextResponse.json({ id: photo?.id, url: signed?.signedUrl ?? null, created_at: photo?.created_at })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const photo_id = req.nextUrl.searchParams.get('id')
  if (!photo_id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service = createServiceClient()

  // Verify inspector owns this photo
  const { data: photo } = await service.from('visit_photos').select('id,photo_path').eq('id', photo_id).eq('inspector_id', user.id).single()
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await service.storage.from(BUCKET).remove([photo.photo_path])
  await service.from('visit_photos').delete().eq('id', photo_id)

  return NextResponse.json({ ok: true })
}
