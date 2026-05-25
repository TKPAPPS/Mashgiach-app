import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = await createServiceClient()
  const type = req.nextUrl.searchParams.get('type') ?? 'visits'

  let rows: Record<string, unknown>[] = []
  let sheetName = 'גיליון1'
  let fileName = 'export'

  if (type === 'visits') {
    const { data } = await service.from('visit_logs')
      .select('*, inspector:profiles(full_name), location:locations(name,city)')
      .order('created_at', { ascending: false })
      .limit(5000)
    sheetName = 'ביקורים'
    fileName = 'visits'
    rows = (data ?? []).map((l: Record<string, unknown>) => ({
      'תאריך': l.created_at,
      'פעולה': l.action_type === 'entry' ? 'כניסה' : 'יציאה',
      'משגיח': (l.inspector as { full_name: string } | undefined)?.full_name ?? '-',
      'מקום': (l.location as { name: string } | undefined)?.name ?? '-',
      'עיר': (l.location as { city: string | null } | undefined)?.city ?? '-',
      'סטטוס': l.internal_status,
      'מרחק GPS (מ׳)': l.distance_meters ?? '',
    }))
  } else if (type === 'deficiencies') {
    const { data } = await service.from('deficiency_reports')
      .select('*, inspector:profiles(full_name), location:locations(name)')
      .order('created_at', { ascending: false })
    sheetName = 'ליקויים'
    fileName = 'deficiencies'
    rows = (data ?? []).map((r: Record<string, unknown>) => ({
      'תאריך': r.created_at,
      'משגיח': (r.inspector as { full_name: string } | undefined)?.full_name ?? '-',
      'מקום': (r.location as { name: string } | undefined)?.name ?? '-',
      'סוג': r.report_type === 'deficiency' ? 'ליקוי' : 'הערה',
      'פירוט': r.description,
      'סטטוס': r.admin_status,
      'הערות': r.admin_notes ?? '',
    }))
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}.xlsx"`,
    },
  })
}
