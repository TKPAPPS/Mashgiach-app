import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { MAX_VISIT_HOURS } from '@/lib/utils/gps'
import { COUNTED_STATUSES } from '@/lib/utils/visits'
import { fetchAll } from '@/lib/utils/dailyReport'
import { pickForgotten, forgotExitMessage, FORGOT_EXIT_DEFAULT_MIN } from '@/lib/utils/forgotExit'
import { autoCloseMessage, AUTO_CLOSE_DEFAULT_H } from '@/lib/utils/autoClose'
import { notifyUsers } from '@/lib/utils/notifyAdmins'

export const dynamic = 'force-dynamic'

type Candidate = { id: string; inspector_id: string | null; location_id: string | null; created_at: string; location?: { name?: string } | null }
type Later = { id: string; inspector_id: string | null; location_id: string | null; created_at: string }

// Hit every 15 minutes by cron-job.org. Two jobs:
// 1. Reminder: entries older than report_settings.forgot_exit_minutes with no
//    exit yet push the inspector once (visit_logs.reminder_sent_at).
// 2. Auto-close: entries still open after report_settings.auto_close_hours are
//    stamped visit_logs.auto_closed_at (0 minutes, "נסגר אוטומטית") and the
//    inspector is told to send a correction if they were there.
// Auth via CRON_SECRET (Authorization: Bearer <secret>, or ?secret=).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || req.nextUrl.searchParams.get('secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data: settings } = await service.from('report_settings').select('forgot_exit_minutes,auto_close_hours').limit(1).maybeSingle()
  const minutes = settings?.forgot_exit_minutes ?? FORGOT_EXIT_DEFAULT_MIN
  const hours = Math.min(settings?.auto_close_hours ?? AUTO_CLOSE_DEFAULT_H, MAX_VISIT_HOURS)
  const now = Date.now()

  const reminders = minutes ? await sendReminders(service, minutes, hours, now) : { reminded: 0, delivered: 0 }
  const closed = await autoClose(service, hours, now)

  if (reminders.reminded > 0) {
    await service.from('system_logs').insert({
      action_type: 'forgot_exit_reminders', performed_by: null, location_id: null,
      details: { minutes, ...reminders }, status: 'success',
    })
  }
  if (closed.auto_closed > 0) {
    await service.from('system_logs').insert({
      action_type: 'auto_close_visits', performed_by: null, location_id: null,
      details: { hours, ...closed }, status: 'success',
    })
  }

  return NextResponse.json({
    status: 'ok',
    minutes, reminders: minutes ? 'on' : 'off', reminded: reminders.reminded, delivered: reminders.delivered,
    auto_close_hours: hours, auto_closed: closed.auto_closed, auto_close_delivered: closed.delivered,
  })
}

type Service = ReturnType<typeof createServiceClient>

/** Open entries (no later counted scan by the same inspector at the same place) in (floorIso, cutoffIso]. */
async function openEntries(service: Service, floorIso: string, cutoffIso: string, extra: 'reminder' | 'auto_close') {
  const { data: candidates } = await fetchAll<Candidate>(() => {
    let q = service.from('visit_logs')
      .select('id,inspector_id,location_id,created_at,location:locations(name)')
      .eq('action_type', 'entry').in('internal_status', COUNTED_STATUSES)
      .is('auto_closed_at', null).not('inspector_id', 'is', null)
      .gt('created_at', floorIso).lte('created_at', cutoffIso)
    if (extra === 'reminder') q = q.is('reminder_sent_at', null)
    return q.order('created_at').order('id')
  })
  if (candidates.length === 0) return []
  const inspectorIds = [...new Set(candidates.map(c => c.inspector_id!))]
  const { data: later } = await fetchAll<Later>(() => service.from('visit_logs')
    .select('id,inspector_id,location_id,created_at')
    .in('inspector_id', inspectorIds).in('internal_status', COUNTED_STATUSES)
    .gt('created_at', candidates[0].created_at)
    .order('created_at').order('id'))
  return pickForgotten(candidates, later)
}

// One push per entry with no exit after `minutes` (visit_logs.reminder_sent_at).
// Only entries that have not reached the auto-close limit yet.
async function sendReminders(service: Service, minutes: number, hours: number, now: number) {
  const cutoff = new Date(now - minutes * 60_000).toISOString()
  const floor = new Date(now - hours * 3600_000).toISOString()
  const forgotten = await openEntries(service, floor, cutoff, 'reminder')
  if (forgotten.length === 0) return { reminded: 0, delivered: 0 }

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
  return { reminded: claimedIds.size, delivered }
}

// Stamp auto_closed_at on entries still open after `hours`. Only entries that
// reached the limit recently (within AUTO_CLOSE_WINDOW_H): history from before
// this feature, or from a long cron outage, is left as it is ("לא נסגר").
const AUTO_CLOSE_WINDOW_H = 2
async function autoClose(service: Service, hours: number, now: number) {
  const cutoff = new Date(now - hours * 3600_000).toISOString()
  const floor = new Date(now - (hours + AUTO_CLOSE_WINDOW_H) * 3600_000).toISOString()
  const toClose = await openEntries(service, floor, cutoff, 'auto_close')
  if (toClose.length === 0) return { auto_closed: 0, delivered: 0 }

  const { data: claimed } = await service.from('visit_logs')
    .update({ auto_closed_at: new Date().toISOString() })
    .in('id', toClose.map(f => f.id)).is('auto_closed_at', null)
    .select('id')
  const claimedIds = new Set((claimed ?? []).map((c: { id: string }) => c.id))

  let delivered = 0
  for (const f of toClose.filter(f => claimedIds.has(f.id))) {
    const ok = await notifyUsers([f.inspector_id!], autoCloseMessage(f.location?.name ?? 'המקום', f.created_at))
    if (ok.size > 0) delivered++
  }
  return { auto_closed: claimedIds.size, delivered }
}
