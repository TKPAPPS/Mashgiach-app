import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids }: { ids: string[] } = await req.json()
  if (!ids?.length) return NextResponse.json({})

  const service = createServiceClient()
  const { data } = await service.from('report_photos').select('report_id').in('report_id', ids).eq('inspector_id', user.id)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.report_id] = (counts[row.report_id] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
