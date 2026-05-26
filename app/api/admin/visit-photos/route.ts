import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'visit-photos'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const visit_log_id = req.nextUrl.searchParams.get('visit_log_id')
  if (!visit_log_id) return NextResponse.json({ error: 'Missing visit_log_id' }, { status: 400 })

  const service = createServiceClient()
  const { data: photos } = await service.from('visit_photos').select('id,photo_path,created_at').eq('visit_log_id', visit_log_id).order('created_at')

  const result = await Promise.all((photos ?? []).map(async (p) => {
    const { data } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    return { id: p.id, url: data?.signedUrl ?? null, created_at: p.created_at }
  }))

  return NextResponse.json(result)
}
