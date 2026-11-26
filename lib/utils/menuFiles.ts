import sharp from 'sharp'
import type { createServiceClient } from '@/lib/supabase/server'

// Restaurant menu files (photos and PDFs) in the private 'menu-files' bucket.
// Shared by the admin and the inspector routes, which differ only in who may act.
export const MENU_BUCKET = 'menu-files'
export const MENU_MAX_BYTES = 10 * 1024 * 1024 // 10 MB, also enforced by the bucket
export const MENU_MAX_FILES = 20
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'])

type Service = ReturnType<typeof createServiceClient>

export async function listMenuFiles(service: Service, location_id: string) {
  const { data } = await service.from('location_menu_files')
    .select('id,location_id,file_path,file_name,mime,size_bytes,created_at')
    .eq('location_id', location_id).order('created_at')
  return Promise.all((data ?? []).map(async f => {
    const { data: signed } = await service.storage.from(MENU_BUCKET).createSignedUrl(f.file_path, 3600)
    return { id: f.id, file_name: f.file_name, mime: f.mime, size_bytes: f.size_bytes, created_at: f.created_at, url: signed?.signedUrl ?? null }
  }))
}

/** Validates, normalises (images to JPEG via sharp, PDFs checked by magic bytes) and stores one file. */
export async function addMenuFile(service: Service, location_id: string, file: File, uploaded_by: string) {
  if (file.size > MENU_MAX_BYTES) return { error: 'הקובץ גדול מדי (עד 10MB)', status: 413 }
  const { count } = await service.from('location_menu_files').select('id', { count: 'exact', head: true }).eq('location_id', location_id)
  if ((count ?? 0) >= MENU_MAX_FILES) return { error: `ניתן לשמור עד ${MENU_MAX_FILES} קבצי תפריט`, status: 400 }

  const type = file.type.toLowerCase().split(';')[0].trim()
  const raw = Buffer.from(await file.arrayBuffer())
  let body: Buffer, mime: 'image/jpeg' | 'application/pdf', ext: 'jpg' | 'pdf'
  if (type === 'application/pdf') {
    if (raw.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'קובץ PDF לא תקין', status: 400 }
    body = raw; mime = 'application/pdf'; ext = 'pdf'
  } else if (IMAGE_MIME.has(type)) {
    try {
      body = await sharp(raw).rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    } catch {
      return { error: 'קובץ תמונה לא תקין', status: 400 }
    }
    mime = 'image/jpeg'; ext = 'jpg'
  } else {
    return { error: 'ניתן להעלות תמונה או PDF בלבד', status: 415 }
  }

  const path = `${location_id}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await service.storage.from(MENU_BUCKET).upload(path, body, { contentType: mime, upsert: false })
  if (upErr) return { error: 'שגיאה בהעלאה', status: 500 }
  const file_name = (file.name || `menu.${ext}`).slice(0, 200)
  const { data: row, error: dbErr } = await service.from('location_menu_files')
    .insert({ location_id, file_path: path, file_name, mime, size_bytes: body.length, uploaded_by })
    .select('id,file_name,mime,size_bytes,created_at').single()
  if (dbErr || !row) {
    await service.storage.from(MENU_BUCKET).remove([path])
    return { error: 'שגיאה בשמירת הקובץ', status: 500 }
  }
  const { data: signed } = await service.storage.from(MENU_BUCKET).createSignedUrl(path, 3600)
  return { file: { ...row, url: signed?.signedUrl ?? null } }
}

export async function deleteMenuFile(service: Service, id: string) {
  const { data: f } = await service.from('location_menu_files').select('file_path').eq('id', id).maybeSingle()
  if (!f) return { ok: true }
  const { error } = await service.from('location_menu_files').delete().eq('id', id)
  if (error) return { error: 'שגיאה במחיקה', status: 500 }
  await service.storage.from(MENU_BUCKET).remove([f.file_path])
  return { ok: true }
}

export async function menuFileLocation(service: Service, id: string): Promise<string | null> {
  const { data } = await service.from('location_menu_files').select('location_id').eq('id', id).maybeSingle()
  return data?.location_id ?? null
}
