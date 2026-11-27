import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Returns { [visit_log_id]: count } for all provided IDs in a single query.
// With by_item: true, returns { "<visit_log_id>|<checklist_item_id>": count }
// for proof photos only (photos tied to a checklist item).
// With thumbs: true, returns { counts, thumbs } where thumbs maps a visit id to a
// signed 1-hour link of one photo (a proof photo first), for the visit-logs preview.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids, by_item, thumbs }: { ids: string[]; by_item?: boolean; thumbs?: boolean } = await req.json()
  if (!ids?.length) return NextResponse.json(thumbs ? { counts: {}, thumbs: {} } : {})

  const service = createServiceClient()
  // The ids go into the request URL, so ask in chunks: a month of visit logs is
  // thousands of ids, and one huge .in() silently returned nothing (before
  // 26/11/2026 the visit-logs camera icon never showed for a 30-day view).
  const CHUNK = 150
  const rows: { visit_log_id: string; checklist_item_id: string | null; photo_path: string; created_at: string }[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await service.from('visit_photos').select('visit_log_id,checklist_item_id,photo_path,created_at').in('visit_log_id', ids.slice(i, i + CHUNK))
    if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
    rows.push(...(data ?? []))
  }

  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (by_item && !row.checklist_item_id) continue
    const key = by_item ? `${row.visit_log_id}|${row.checklist_item_id}` : row.visit_log_id
    counts[key] = (counts[key] ?? 0) + 1
  }

  if (!thumbs) return NextResponse.json(counts)

  // One photo per visit: the first proof photo, else the first general one.
  const pick = new Map<string, { path: string; proof: boolean; at: string }>()
  for (const r of rows) {
    const cur = pick.get(r.visit_log_id)
    const proof = !!r.checklist_item_id
    if (!cur || (proof && !cur.proof) || (proof === cur.proof && r.created_at < cur.at)) pick.set(r.visit_log_id, { path: r.photo_path, proof, at: r.created_at })
  }
  const entries = [...pick.entries()]
  const thumbMap: Record<string, string> = {}
  if (entries.length) {
    const { data: signed } = await service.storage.from('visit-photos').createSignedUrls(entries.map(([, v]) => v.path), 3600)
    for (const [i, [visitId]] of entries.entries()) {
      const url = signed?.[i]?.signedUrl
      if (url) thumbMap[visitId] = url
    }
  }
  return NextResponse.json({ counts, thumbs: thumbMap })
}
