import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Returns { [visit_log_id]: count } for the inspector's own visits
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids }: { ids: string[] } = await req.json()
  if (!ids?.length) return NextResponse.json({})

  const service = createServiceClient()
  const { data } = await service.from('visit_photos')
    .select('visit_log_id')
    .in('visit_log_id', ids)
    .eq('inspector_id', user.id)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.visit_log_id] = (counts[row.visit_log_id] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
