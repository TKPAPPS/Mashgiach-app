import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { location_id, visit_log_id, checks } = await req.json()
  // checks = [{ checklist_item_id, item_name, note }]

  if (!location_id || !Array.isArray(checks)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const service = await createServiceClient()

  const rows = checks.map((c: { checklist_item_id?: string; item_name?: string; note?: string }) => ({
    visit_log_id: visit_log_id ?? null,
    inspector_id: user.id,
    location_id,
    checklist_item_id: c.checklist_item_id ?? null,
    item_name: c.item_name ?? null,
    note: c.note ?? null,
  }))

  if (rows.length > 0) {
    await service.from('visit_checks').insert(rows)
  }

  return NextResponse.json({ success: true })
}
