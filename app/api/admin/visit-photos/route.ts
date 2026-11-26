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
  const { data: photos } = await service.from('visit_photos').select('id,photo_path,checklist_item_id,created_at').eq('visit_log_id', visit_log_id).order('created_at')

  // Names of the checklist items that proof photos belong to.
  const itemIds = [...new Set((photos ?? []).map(p => p.checklist_item_id).filter((x): x is string => !!x))]
  const { data: items } = itemIds.length
    ? await service.from('checklist_items').select('id,name').in('id', itemIds)
    : { data: [] as { id: string; name: string }[] }
  const names = new Map((items ?? []).map(i => [i.id, i.name]))

  const result = await Promise.all((photos ?? []).map(async (p) => {
    const { data } = await service.storage.from(BUCKET).createSignedUrl(p.photo_path, 3600)
    const item_name = p.checklist_item_id ? names.get(p.checklist_item_id) ?? null : null
    return { id: p.id, url: data?.signedUrl ?? null, checklist_item_id: p.checklist_item_id, item_name, created_at: p.created_at }
  }))

  return NextResponse.json(result)
}
