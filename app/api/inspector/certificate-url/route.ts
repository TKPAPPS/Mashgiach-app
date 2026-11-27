import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { storagePathFrom, CERT_VIEW_SECONDS } from '@/lib/utils/storagePath'

// Signed 1-hour link to the kashrut certificate of a restaurant the inspector
// is assigned to.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const locationId = req.nextUrl.searchParams.get('location_id')
  if (!locationId) return NextResponse.json({ error: 'Missing location_id' }, { status: 400 })

  const service = createServiceClient()
  const { data: assignment } = await service.from('inspector_locations')
    .select('id').eq('inspector_id', user.id).eq('location_id', locationId).maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: loc } = await service.from('locations').select('kashrus_certificate_url').eq('id', locationId).maybeSingle()
  const path = storagePathFrom(loc?.kashrus_certificate_url, 'certificates')
  if (!path) return NextResponse.json({ error: 'אין תעודה' }, { status: 404 })

  const { data: signed, error } = await service.storage.from('certificates').createSignedUrl(path, CERT_VIEW_SECONDS)
  if (error || !signed) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })

  return NextResponse.json({ url: signed.signedUrl })
}
