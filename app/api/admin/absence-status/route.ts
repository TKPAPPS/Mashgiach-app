import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VALID = new Set(['pending', 'approved', 'denied'])

// Updates an absence request's status and reconciles the inspector's vacation
// balance atomically. Approving a vacation request deducts the (inclusive) day
// count once; moving it back to pending/denied restores it. The deduction logic
// lives in the apply_absence_status DB function to stay race-safe and idempotent.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, admin_status } = await req.json()
  if (!id || !VALID.has(admin_status)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  type AbsenceStatusResult = { admin_status: string; days_deducted: number; vacation_days_remaining: number }

  const service = createServiceClient()
  // The Database type intentionally leaves Functions empty (expanding it makes
  // Supabase's generic relationship inference degrade), so type this RPC locally.
  const rpc = service.rpc as unknown as (
    fn: 'apply_absence_status',
    args: { p_id: string; p_status: string },
  ) => Promise<{ data: AbsenceStatusResult[] | null; error: unknown }>

  const { data, error } = await rpc('apply_absence_status', { p_id: id, p_status: admin_status })
  if (error || !data?.[0]) {
    return NextResponse.json({ error: 'שגיאה בעדכון סטטוס' }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...data[0] })
}
