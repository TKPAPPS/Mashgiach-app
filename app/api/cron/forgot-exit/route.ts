import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { MAX_VISIT_HOURS } from '@/lib/utils/gps'
import { COUNTED_STATUSES } from '@/lib/utils/visits'
import { fetchAll } from '@/lib/utils/dailyReport'
import { pickForgotten, forgotExitMessage, FORGOT_EXIT_DEFAULT_MIN } from '@/lib/utils/forgotExit'
import { notifyUsers } from '@/lib/utils/notifyAdmins'

export const dynamic = 'force-dynamic'

type Candidate = { id: string; inspector_id: string | null; location_id: string | null; created_at: string; location?: { name?: string } | null }
type Later = { id: string; inspector_id: string | null; location_id: string | null; created_at: string }

// Hit every 15 minutes by cron-job.org. Finds entries older than
// report_settings.forgot_exit_minutes with no exit yet, and pushes each inspector
// once per entry (visit_logs.reminder_sent_at). Entries older than MAX_VISIT_HOURS
// are skipped: the next scan there already opens a new visit.
// Auth via CRON_SECRET (Authorization: Bearer <secret>, or ?secret=).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || req.nextUrl.searchParams.get('secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data: settings } = await service.from('report_settings').select('forgot_exit_minutes').limit(1).maybeSingle()
  const minutes = settings?.forgot_exit_minutes ?? FORGOT_EXIT_DEFAULT_MIN
  if (!minutes) return NextResponse.json({ status: 'disabled' })

  const now = Date.now()
  const cutoff = new Date(now - minutes * 60_000).toISOString()
  const floor = new Date(now - MAX_VISIT_HOURS * 3600_000).toISOString()

  const { data: candidates } = await fetchAll<Candidate>(() => service.from('visit_logs')
    .select('id,inspector_id,location_id,created_at,location:locations(name)')
    .eq('action_type', 'entry').in('internal_status', COUNTED_STATUSES)
    .is('reminder_sent_at', null).not('inspector_id', 'is', null)
    .gt('created_at', floor).lte('created_at', cutoff)
    .order('created_at').order('id'))
  if (candidates.length === 0) return NextResponse.json({ status: 'ok', minutes, reminded: 0, delivered: 0 })

  const inspectorIds = [...new Set(candidates.map(c => c.inspector_id!))]
  const { data: later } = await fetchAll<Later>(() => service.from('visit_logs')
    .select('id,inspector_id,location_id,created_at')
    .in('inspector_id', inspectorIds).in('internal_status', COUNTED_STATUSES)
    .gt('created_at', candidates[0].created_at)
    .order('created_at').order('id'))

  const forgotten = pickForgotten(candidates, later)
  if (forgotten.length === 0) return NextResponse.json({ status: 'ok', minutes, reminded: 0, delivered: 0 })

  // Claim before sending, so two overlapping runs never push the same entry twice.
  const { data: claimed } = await service.from('visit_logs')
    .update({ reminder_sent_at: new Date().toISOString() })
    .in('id', forgotten.map(f => f.id)).is('reminder_sent_at', null)
    .select('id')
  const claimedIds = new Set((claimed ?? []).map((c: { id: string }) => c.id))

  let delivered = 0
  for (const f of forgotten.filter(f => claimedIds.has(f.id))) {
    const ok = await notifyUsers([f.inspector_id!], forgotExitMessage(f.location?.name ?? 'המקום', f.created_at))
    if (ok.size > 0) delivered++
  }

  await service.from('system_logs').insert({
    action_type: 'forgot_exit_reminders',
    performed_by: null,
    location_id: null,
    details: { minutes, reminded: claimedIds.size, delivered },
    status: 'success',
  })

  return NextResponse.json({ status: 'ok', minutes, reminded: claimedIds.size, delivered })
}
