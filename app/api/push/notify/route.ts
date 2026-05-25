import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import webpush from 'web-push'

export async function POST(req: NextRequest) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || vapidPublicKey.startsWith('placeholder')) {
    return NextResponse.json({ skipped: 'vapid not configured' })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const { title, body, url } = await req.json()
  const service = createServiceClient()

  // Get all admin user IDs
  const { data: admins } = await service.from('profiles').select('id').eq('role', 'admin')
  const adminIds = (admins ?? []).map((a: { id: string }) => a.id)

  if (adminIds.length === 0) return NextResponse.json({ sent: 0 })

  // Get their push subscriptions
  const { data: subs } = await service.from('push_subscriptions')
    .select('*')
    .in('user_id', adminIds)

  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const payload = JSON.stringify({ title, body, url })
  let sent = 0
  const failed: string[] = []

  await Promise.all(subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload)
      sent++
    } catch {
      failed.push(sub.endpoint)
    }
  }))

  // Remove expired subscriptions
  if (failed.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', failed)
  }

  return NextResponse.json({ sent })
}
