import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/utils/notifyAdmins'

const VALID_REQUEST_TYPES = ['vacation', 'absence', 'replacement', 'other'] as const
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(s: string | null | undefined): s is string {
  return !!s && ISO_DATE_RE.test(s) && !isNaN(Date.parse(s))
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { request_type, start_date, end_date, location_id, replacement_inspector_id, notes } = await req.json()

  if (!VALID_REQUEST_TYPES.includes(request_type)) {
    return NextResponse.json({ error: 'Invalid request_type' }, { status: 400 })
  }

  const safeStart = isValidDate(start_date) ? start_date : null
  const safeEnd   = isValidDate(end_date)   ? end_date   : null

  const service = createServiceClient()

  // Validate replacement_inspector_id is a real inspector (not an arbitrary UUID)
  let safeReplacementId: string | null = null
  if (replacement_inspector_id) {
    const { data: repl } = await service
      .from('profiles')
      .select('id')
      .eq('id', replacement_inspector_id)
      .eq('role', 'mashgiach')
      .single()
    safeReplacementId = repl?.id ?? null
  }

  const { error } = await service.from('absence_requests').insert({
    inspector_id: user.id,
    request_type,
    start_date: safeStart,
    end_date: safeEnd,
    location_id: location_id || null,
    replacement_inspector_id: safeReplacementId,
    notes: notes ? String(notes).trim().slice(0, 2000) : null,
  })

  if (error) return NextResponse.json({ error: 'שגיאה בשליחת הבקשה' }, { status: 500 })

  // Notify admins
  try {
    const typeLabels: Record<string, string> = {
      vacation: 'חופשה', absence: 'היעדרות', replacement: 'החלפה', other: 'אחר',
    }
    const { data: inspector } = await service.from('profiles').select('full_name').eq('id', user.id).single()
    await notifyAdmins({
      title: 'בקשת היעדרות חדשה',
      body: `${inspector?.full_name ?? ''}, ${typeLabels[request_type]}`,
      url: '/admin',
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true })
}
