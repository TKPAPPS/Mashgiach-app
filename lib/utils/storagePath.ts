/**
 * The object path inside a storage bucket, from either a stored path
 * ("certificates/<id>/file.pdf") or an old public URL
 * (".../storage/v1/object/public/<bucket>/<path>"). Returns null for anything else.
 * Rows written before a bucket went private still hold the public URL, so every
 * signed-link route reads both forms.
 */
export function storagePathFrom(value: string | null | undefined, bucket: string): string | null {
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '') || null
  const marker = `/storage/v1/object/public/${bucket}/`
  const at = value.indexOf(marker)
  if (at < 0) return null
  const raw = value.slice(at + marker.length).split('?')[0]
  if (!raw) return null
  try { return decodeURIComponent(raw) } catch { return raw }
}

/** A certificate share link sent outside the app (to a restaurant) lasts 7 days. */
export const CERT_SHARE_SECONDS = 7 * 24 * 3600
/** Opening a certificate inside the app: 1 hour. */
export const CERT_VIEW_SECONDS = 3600

/**
 * Object path for a newly uploaded certificate. Storage keys must be plain
 * ASCII, so Hebrew or other characters in the file name are dropped; the time
 * prefix keeps every upload unique (an old share link keeps the old file).
 */
export function certificateObjectPath(locationId: string, fileName: string, now: number = Date.now()): string {
  const ext = (fileName.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '').toLowerCase()
  const base = fileName.slice(0, fileName.length - ext.length)
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `certificates/${locationId}/${now}-${base || 'certificate'}${ext}`
}
