import { createServiceClient } from '@/lib/supabase/server'
import webpush from 'web-push'

export async function notifyAdmins({ title, body, url }: { title: string; body: string; url: string }) {
  const vapidPublicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject    = process.env.VAPID_SUBJECT

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || vapidPublicKey.startsWith('placeholder')) return

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const service = createServiceClient()
  const { data: admins } = await service.from('profiles').select('id').eq('role', 'admin')
  const adminIds = (admins ?? []).map((a: { id: string }) => a.id)
  if (adminIds.length === 0) return

  const { data: subs } = await service.from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', adminIds)
  if (!subs || subs.length === 0) return

  const payload = JSON.stringify({ title, body, url })
  const failed: string[] = []

  await Promise.all(subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
    } catch {
      failed.push(sub.endpoint)
    }
  }))

  if (failed.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', failed)
  }
}
