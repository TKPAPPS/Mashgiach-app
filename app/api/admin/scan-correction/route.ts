import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

// Admin review of a missed-scan correction. Approving calls apply_scan_correction
// which creates the entry/exit visit_logs at the estimated times; denying just
// marks the row. Only pending requests can transition.
export async function PATCH(req: NextRequest) {
  try {
    return await handlePatch(req)
  } catch {
    // Without this, an uncaught throw returns a non-JSON 500 that the client
    // surfaces as the generic "שגיאה בעדכון", hiding the real cause.
    return NextResponse.json({ error: 'שגיאה בעדכון הבקשה' }, { status: 500 })
  }
}

async function handlePatch(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, status, admin_notes } = await req.json()
  if (!id || (status !== 'approved' && status !== 'denied')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: existing } = await service.from('scan_corrections').select('status').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })
  }

  if (status === 'approved') {
    // The Database type intentionally leaves Functions empty, so type this RPC
    // locally (mirrors the apply_absence_status route).
    const rpc = service.rpc as unknown as (
      fn: 'apply_scan_correction',
      args: { p_id: string; p_reviewer: string },
    ) => Promise<{ data: unknown; error: unknown }>
    const { error: rpcError } = await rpc('apply_scan_correction', { p_id: id, p_reviewer: admin.id })
    if (rpcError) return NextResponse.json({ error: 'שגיאה באישור הבקשה' }, { status: 500 })
    if (admin_notes != null) {
      await service.from('scan_corrections').update({ admin_notes: String(admin_notes).slice(0, 2000) }).eq('id', id)
    }
  } else {
    const { error } = await service.from('scan_corrections').update({
      status: 'denied',
      admin_notes: admin_notes != null ? String(admin_notes).slice(0, 2000) : null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: 'שגיאה בעדכון הבקשה' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
