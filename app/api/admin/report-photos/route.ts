import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'visit-photos'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const report_id = req.nextUrl.searchParams.get('report_id')
  if (!report_id) return NextResponse.json({ error: 'Missing report_id' }, { status: 400 })

  const service = createServiceClient()
  const { data: photos } = await service.from('report_photos').select('id,photo_path,created_at').eq('report_id', report_id).order('created_at')

  const result = await Promise.all((photos ?? []).map(async (p) => {
    const { data } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    return { id: p.id, url: data?.signedUrl ?? null, created_at: p.created_at }
  }))

  return NextResponse.json(result)
}
