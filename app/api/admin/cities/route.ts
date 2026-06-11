import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// City is free text on locations (no cities table). These endpoints let an admin
// tidy that free-text set: rename a city across all its locations, or "delete" a
// city by detaching it (set city=null) from the locations that use it. Neither
// touches the locations themselves beyond the city field.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { from, to } = await req.json()
  const fromName = typeof from === 'string' ? from.trim() : ''
  const toName = typeof to === 'string' ? to.trim() : ''
  if (!fromName || !toName) {
    return NextResponse.json({ error: 'Missing city names' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('locations').update({ city: toName }).eq('city', fromName).select('id')
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון העיר' }, { status: 500 })

  return NextResponse.json({ success: true, updated: data?.length ?? 0 })
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const city = req.nextUrl.searchParams.get('city')?.trim()
  if (!city) return NextResponse.json({ error: 'Missing city' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('locations').update({ city: null }).eq('city', city).select('id')
  if (error) return NextResponse.json({ error: 'שגיאה במחיקת העיר' }, { status: 500 })

  return NextResponse.json({ success: true, updated: data?.length ?? 0 })
}
