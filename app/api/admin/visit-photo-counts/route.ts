import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Returns { [visit_log_id]: count } for all provided IDs in a single query.
// With by_item: true, returns { "<visit_log_id>|<checklist_item_id>": count }
// for proof photos only (photos tied to a checklist item).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids, by_item }: { ids: string[]; by_item?: boolean } = await req.json()
  if (!ids?.length) return NextResponse.json({})

  const service = createServiceClient()
  // The ids go into the request URL, so ask in chunks: a month of visit logs is
  // thousands of ids, and one huge .in() silently returned nothing (before
  // 26/11/2026 the visit-logs camera icon never showed for a 30-day view).
  const CHUNK = 150
  const rows: { visit_log_id: string; checklist_item_id: string | null }[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await service.from('visit_photos').select('visit_log_id,checklist_item_id').in('visit_log_id', ids.slice(i, i + CHUNK))
    if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
    rows.push(...(data ?? []))
  }

  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (by_item && !row.checklist_item_id) continue
    const key = by_item ? `${row.visit_log_id}|${row.checklist_item_id}` : row.visit_log_id
    counts[key] = (counts[key] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
