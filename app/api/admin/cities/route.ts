import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

// Closed city list (table `cities`). A location points to a city by city_id and
// its `city` text is derived by a DB trigger (Hebrew name), so renaming a city
// here renames it on every location. Deleting a city that still has locations
// requires merging them into another city first.

const clean = (v: unknown, max = 60) => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : '' }

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceClient()
  const [{ data: cities }, { data: locs }] = await Promise.all([
    service.from('cities').select('id,name_he,name_en,active,created_at').order('name_he'),
    service.from('locations').select('city_id'),
  ])
  const counts = new Map<string, number>()
  for (const l of locs ?? []) if (l.city_id) counts.set(l.city_id, (counts.get(l.city_id) ?? 0) + 1)
  return NextResponse.json((cities ?? []).map(c => ({ ...c, locations: counts.get(c.id) ?? 0 })))
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const name_he = clean(body.name_he), name_en = clean(body.name_en) || null
  if (!name_he) return NextResponse.json({ error: 'יש להזין שם עיר בעברית' }, { status: 400 })
  const { data, error } = await createServiceClient().from('cities').insert({ name_he, name_en }).select().single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'עיר בשם זה כבר קיימת' : 'שגיאה בשמירה' }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const id = clean(body.id, 64), name_he = clean(body.name_he)
  if (!id || !name_he) return NextResponse.json({ error: 'יש להזין שם עיר בעברית' }, { status: 400 })
  const update: { name_he: string; name_en?: string | null } = { name_he }
  if ('name_en' in body) update.name_en = clean(body.name_en) || null
  const { error } = await createServiceClient().from('cities').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'עיר בשם זה כבר קיימת' : 'שגיאה בשמירה' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id=X[&merge_into=Y]: moves X's locations to Y (if given), then deletes X.
export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  const mergeInto = req.nextUrl.searchParams.get('merge_into')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (mergeInto === id) return NextResponse.json({ error: 'יש לבחור עיר אחרת' }, { status: 400 })
  const service = createServiceClient()
  const { count } = await service.from('locations').select('id', { count: 'exact', head: true }).eq('city_id', id)
  if ((count ?? 0) > 0) {
    if (!mergeInto) return NextResponse.json({ error: 'לעיר יש מקומות. יש לבחור עיר להעביר אליה', needs_merge: true }, { status: 409 })
    const { error: mvErr } = await service.from('locations').update({ city_id: mergeInto }).eq('city_id', id)
    if (mvErr) return NextResponse.json({ error: 'שגיאה בהעברת המקומות' }, { status: 500 })
  }
  const { error } = await service.from('cities').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'שגיאה במחיקה' }, { status: 500 })
  return NextResponse.json({ ok: true, moved: count ?? 0 })
}
