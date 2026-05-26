import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Returns { [visit_log_id]: count } for all provided IDs in a single query
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids }: { ids: string[] } = await req.json()
  if (!ids?.length) return NextResponse.json({})

  const service = createServiceClient()
  const { data } = await service.from('visit_photos').select('visit_log_id').in('visit_log_id', ids)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.visit_log_id] = (counts[row.visit_log_id] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
