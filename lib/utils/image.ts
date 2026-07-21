// Re-encode a user-selected image to a downscaled JPEG in the browser before
// upload. iOS often hands back HEIC bytes (sometimes even labeled image/jpeg)
// that the server's sharp step cannot decode, which surfaced as a 400 "invalid
// image" when a mashgiach uploaded from an iPhone. Drawing the image through a
// canvas converts anything the browser can render (including iOS HEIC) into real
// JPEG bytes and shrinks the payload well under the serverless body limit.
//
// Falls back to the original File if conversion is not possible (non-image,
// decode failure, or no canvas), so callers can always upload something.
export async function toJpegFile(file: File, maxDim = 1920, quality = 0.85): Promise<File> {
  if (typeof document === 'undefined') return file
  if (!file.type.startsWith('image/')) return file

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
    try { await img.decode() } catch { /* onload already fired */ }

    const srcW = img.naturalWidth || img.width
    const srcH = img.naturalHeight || img.height
    if (!srcW || !srcH) return file

    const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
