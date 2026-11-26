import { createServiceClient } from '@/lib/supabase/server'
import webpush from 'web-push'

type Payload = { title: string; body: string; url: string }

function vapidReady(): boolean {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subj = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subj || pub.startsWith('placeholder')) return false
  webpush.setVapidDetails(subj, pub, priv)
  return true
}

/**
 * Push to every device of the given users. Returns the user ids that had at
 * least one device accept the push. Expired endpoints are removed.
 */
export async function notifyUsers(userIds: string[], { title, body, url }: Payload): Promise<Set<string>> {
  const delivered = new Set<string>()
  if (userIds.length === 0 || !vapidReady()) return delivered

  const service = createServiceClient()
  const { data: subs } = await service.from('push_subscriptions')
    .select('user_id,endpoint,p256dh,auth')
    .in('user_id', userIds)
  if (!subs || subs.length === 0) return delivered

  const payload = JSON.stringify({ title, body, url })
  const expired: string[] = []

  await Promise.all(subs.map(async (sub: { user_id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      delivered.add(sub.user_id)
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) expired.push(sub.endpoint)
    }
  }))

  if (expired.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', expired)
  }
  return delivered
}

export async function notifyAdmins(payload: Payload) {
  const service = createServiceClient()
  const { data: admins } = await service.from('profiles').select('id').eq('role', 'admin')
  await notifyUsers((admins ?? []).map((a: { id: string }) => a.id), payload)
}
