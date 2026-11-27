import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { storagePathFrom, CERT_SHARE_SECONDS, CERT_VIEW_SECONDS } from '@/lib/utils/storagePath'

// Signed link to a restaurant's kashrut certificate (private bucket).
// ?share=1 signs for 7 days, for sending to the restaurant; otherwise 1 hour.
export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const locationId = req.nextUrl.searchParams.get('location_id')
  if (!locationId) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })
  const share = req.nextUrl.searchParams.get('share') === '1'

  const service = createServiceClient()
  const { data: loc } = await service.from('locations').select('kashrus_certificate_url').eq('id', locationId).maybeSingle()
  const path = storagePathFrom(loc?.kashrus_certificate_url, 'certificates')
  if (!path) return NextResponse.json({ error: 'אין תעודה' }, { status: 404 })

  const seconds = share ? CERT_SHARE_SECONDS : CERT_VIEW_SECONDS
  const { data: signed, error } = await service.storage.from('certificates').createSignedUrl(path, seconds)
  if (error || !signed) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })

  return NextResponse.json({ url: signed.signedUrl, expires_in: seconds })
}
