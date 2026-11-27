import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

const HEALTH_DAYS = 30

// Per inspector: share of real scans (last 30 days) that carried a location,
// and whether at least one phone has notifications on.
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  // The hand-written Database type lists no functions; same cast as the scan-correction route.
  const svc = service as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }
  const [{ data: rows, error }, { data: subs }] = await Promise.all([
    svc.rpc('inspector_scan_health', { p_days: HEALTH_DAYS }),
    service.from('push_subscriptions').select('user_id'),
  ])
  if (error) return NextResponse.json({ error: 'שגיאה בטעינה' }, { status: 500 })
  const withPush = new Set((subs ?? []).map((s: { user_id: string }) => s.user_id))
  const out: Record<string, { scans: number; with_gps: number; push: boolean }> = {}
  for (const r of (rows ?? []) as { inspector_id: string; scans: number; with_gps: number }[]) {
    out[r.inspector_id] = { scans: Number(r.scans), with_gps: Number(r.with_gps), push: withPush.has(r.inspector_id) }
  }
  for (const id of withPush) if (!out[id]) out[id] = { scans: 0, with_gps: 0, push: true }
  return NextResponse.json({ days: HEALTH_DAYS, inspectors: out })
}
