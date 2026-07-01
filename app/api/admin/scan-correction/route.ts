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

  const { id, status, admin_notes, admin_entry } = await req.json()
  if (!id || (status !== 'approved' && status !== 'denied')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: existing } = await service.from('scan_corrections').select('status, est_exit').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })
  }

  if (status === 'approved') {
    // Optional admin-supplied arrival for a missed-checkout with no check-in on
    // record. datetime-local carries no zone; inspectors/admins are in Bangkok,
    // so interpret it as Asia/Bangkok (UTC+7). Written to est_entry so the RPC can
    // record a full visit without any signature change.
    if (admin_entry != null && admin_entry !== '') {
      const m = String(admin_entry).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/)
      const entryMs = m ? Date.parse(`${m[2] ? admin_entry : `${admin_entry}:00`}+07:00`) : NaN
      const exitMs = Date.parse(existing.est_exit as string)
      if (isNaN(entryMs)) return NextResponse.json({ error: 'זמן כניסה לא תקין' }, { status: 400 })
      if (entryMs > Date.now() + 60_000) return NextResponse.json({ error: 'לא ניתן לדווח על זמן עתידי' }, { status: 400 })
      if (entryMs >= exitMs) return NextResponse.json({ error: 'זמן הכניסה חייב להיות לפני זמן היציאה' }, { status: 400 })
      await service.from('scan_corrections').update({ est_entry: new Date(entryMs).toISOString() }).eq('id', id)
    }

    // The Database type intentionally leaves Functions empty, so type this RPC
    // locally (mirrors the apply_absence_status route). Cast the client, not the
    // method: pulling `service.rpc` into a variable detaches it from the client,
    // so supabase-js loses `this` and throws "Cannot read properties of undefined
    // (reading 'rest')". Call it as a bound method instead.
    const svc = service as unknown as {
      rpc: (
        fn: 'apply_scan_correction',
        args: { p_id: string; p_reviewer: string },
      ) => Promise<{ data: unknown; error: { message?: string } | null }>
    }
    const { error: rpcError } = await svc.rpc('apply_scan_correction', { p_id: id, p_reviewer: admin.id })
    if (rpcError) {
      // A missed-checkout only adds a forgotten exit onto an existing check-in.
      // When the inspector has no open check-in to close, tell the admin plainly
      // (and point them at the right correction type) instead of a generic error.
      const noOpenEntry = (rpcError.message ?? '').includes('no open check-in')
      return NextResponse.json(
        noOpenEntry
          ? { error: 'לא נמצאה כניסה במערכת. הזן זמן כניסה כדי לרשום ביקור מלא.', needs_entry: true }
          : { error: 'שגיאה באישור הבקשה' },
        { status: noOpenEntry ? 409 : 500 },
      )
    }
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
