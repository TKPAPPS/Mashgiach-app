import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/utils/notifyAdmins'

// Secured: requires an authenticated admin session.
// Internal callers (scan, report, absence routes) use notifyAdmins() directly instead.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { title, body, url } = await req.json()
  if (!title || !body) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  await notifyAdmins({ title: String(title), body: String(body), url: String(url ?? '/admin') })
  return NextResponse.json({ ok: true })
}
