import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { notifyAdmins, notifyUsers } from '@/lib/utils/notifyAdmins'
import { bangkokToday, daysLeft, stageFor, certAlertMessage } from '@/lib/utils/certExpiry'

type Service = SupabaseClient<Database>

/** Not before 08:00 Bangkok, so nobody is woken by a certificate alert. */
export const CERT_CHECK_HOUR = 8

type Loc = { id: string; name: string; kashrus_certificate_expires_on: string; certificate_alert_stage: number }

/**
 * Once a day (report_settings.cert_check_last_date): for every active restaurant
 * whose certificate reached a new stage (30 days, 7 days, expired), push the
 * admins and the restaurant's inspectors once. The stage is claimed before the
 * push, so two runs never send twice. Called by /api/cron/daily-report (hourly).
 */
export async function runCertificateCheck(service: Service, now: Date = new Date(), force = false) {
  const today = bangkokToday(now)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23' }).format(now))
  if (!force && hour < CERT_CHECK_HOUR) return { status: 'not-time-yet' as const, alerted: 0 }

  const { data: row } = await service.from('report_settings').select('id,cert_check_last_date').limit(1).maybeSingle()
  if (!row) return { status: 'no-config' as const, alerted: 0 }
  if (!force && row.cert_check_last_date === today) return { status: 'already-checked' as const, alerted: 0 }
  // Claim the day first, so overlapping cron calls do the work once.
  await service.from('report_settings').update({ cert_check_last_date: today }).eq('id', row.id)

  const { data } = await service.from('locations')
    .select('id,name,kashrus_certificate_expires_on,certificate_alert_stage')
    .eq('status', 'active').not('kashrus_certificate_expires_on', 'is', null).lt('certificate_alert_stage', 3)
  const due = ((data ?? []) as Loc[])
    .map(l => ({ ...l, target: stageFor(daysLeft(l.kashrus_certificate_expires_on, now)) }))
    .filter(l => l.target > l.certificate_alert_stage)

  let alerted = 0
  for (const l of due) {
    const { data: claimed } = await service.from('locations')
      .update({ certificate_alert_stage: l.target, certificate_alert_at: now.toISOString() })
      .eq('id', l.id).eq('certificate_alert_stage', l.certificate_alert_stage).select('id')
    if (!claimed?.length) continue
    alerted++
    const msg = certAlertMessage(l.name, l.kashrus_certificate_expires_on, l.target as 1 | 2 | 3)
    try {
      await notifyAdmins(msg)
      const { data: assigned } = await service.from('inspector_locations').select('inspector_id').eq('location_id', l.id)
      const ids = (assigned ?? []).map((a: { inspector_id: string }) => a.inspector_id)
      if (ids.length) await notifyUsers(ids, { ...msg, url: `/inspector/location/${l.id}` })
    } catch { /* a failed push never blocks the stage */ }
  }

  if (alerted > 0) {
    await service.from('system_logs').insert({
      action_type: 'certificate_expiry_check', performed_by: null, location_id: null,
      details: { date: today, alerted, locations: due.map(d => ({ id: d.id, stage: d.target })) }, status: 'success',
    })
  }
  return { status: 'checked' as const, alerted }
}
