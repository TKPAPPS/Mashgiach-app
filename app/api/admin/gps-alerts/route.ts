import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

// Marks every unread GPS alert as read in one statement (the dashboard list only
// loads a page of alerts, so a client-side "mark all" missed the rest).
export async function PATCH() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const { data, error } = await service.from('gps_alerts').update({ read: true }).eq('read', false).select('id')
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0 })
}
