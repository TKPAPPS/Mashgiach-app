'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ExternalLink, QrCode } from 'lucide-react'
import { formatRelative } from '@/lib/utils/format'
import type { Location, VisitLog, ChecklistItem } from '@/lib/supabase/types'

export default function InspectorLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const [location, setLocation] = useState<Location | null>(null)
  const [recentVisits, setRecentVisits] = useState<VisitLog[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: loc }, { data: assignment }, { data: visits }, { data: checklist }] = await Promise.all([
      supabase.from('locations').select('*').eq('id', id).single(),
      supabase.from('inspector_locations').select('id').eq('inspector_id', user.id).eq('location_id', id).maybeSingle(),
      supabase.from('visit_logs').select('*').eq('location_id', id).eq('inspector_id', user.id)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('checklist_items').select('*').eq('active', true).order('sort_order'),
    ])

    if (!loc || !assignment) { router.push('/inspector'); return }

    setLocation(loc as Location)
    setRecentVisits((visits ?? []) as VisitLog[])
    setChecklistItems((checklist ?? []) as ChecklistItem[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (!location) return (
    <div className="app" style={{ padding: 24 }}>
      <p>מקום לא נמצא</p>
      <button className="button button--ghost" onClick={() => router.push('/inspector')}>חזור</button>
    </div>
  )

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh' }}>
      <header className="appHeader">
        <button className="button button--icon button--ghost" style={{ color: '#fff', border: 'none' }}
          onClick={() => router.push('/inspector')}>
          <ArrowRight size={18} />
        </button>
        <div className="appHeader__title" style={{ flex: 1, textAlign: 'center' }}>{location.name}</div>
      </header>

      <div style={{ padding: '16px 14px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Details card */}
        <div className="card">
          <div className="card__header"><div className="card__title">פרטי מקום</div></div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {location.city && <div><span className="textMuted textSm">עיר: </span>{location.city}</div>}
            {location.address && <div><span className="textMuted textSm">כתובת: </span>{location.address}</div>}
            {location.contact_name && <div><span className="textMuted textSm">איש קשר: </span>{location.contact_name}</div>}
            {location.contact_phone && (
              <div><span className="textMuted textSm">טלפון: </span>
                <a href={`tel:${location.contact_phone}`}>{location.contact_phone}</a>
              </div>
            )}
          </div>
        </div>

        {/* Kashrus procedure */}
        {(location.kashrus_procedure || location.kashrus_certificate_url) && (
          <div className="card">
            <div className="card__header"><div className="card__title">נוהל כשרות</div></div>
            <div className="card__body">
              {location.kashrus_procedure && (
                <p style={{ fontSize: '.88rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {location.kashrus_procedure}
                </p>
              )}
              {location.kashrus_certificate_url && (
                <a href={location.kashrus_certificate_url} target="_blank" rel="noreferrer"
                  className="button button--ghost button--sm" style={{ marginTop: 10 }}>
                  <ExternalLink size={13} /> תעודת כשרות
                </a>
              )}
            </div>
          </div>
        )}

        {/* Checklist */}
        {checklistItems.length > 0 && (
          <div className="card">
            <div className="card__header"><div className="card__title">רשימת בדיקות</div></div>
            <div className="card__body">
              <div className="checklistWrap">
                {checklistItems.map(item => (
                  <div key={item.id} className="checkItem">
                    <input type="checkbox" style={{ accentColor: 'var(--primary)' }} />
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              <p className="textSm textMuted" style={{ marginTop: 10 }}>
                * בדיקות נרשמות אוטומטית עם יציאה
              </p>
            </div>
          </div>
        )}

        {/* QR scan */}
        <button className="button button--primary"
          style={{ height: 52, fontSize: '1rem' }}
          onClick={() => router.push('/inspector/scan')}>
          <QrCode size={18} /> סרוק QR לכניסה / יציאה
        </button>

        {/* Recent visits */}
        {recentVisits.length > 0 && (
          <div className="card">
            <div className="card__header"><div className="card__title">ביקורים אחרונים</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px' }}>
              {recentVisits.map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.85rem' }}>
                  <span>{v.action_type === 'entry' ? 'כניסה' : 'יציאה'}</span>
                  <span className="textMuted">{formatRelative(v.created_at)}</span>
                  <span className={`badge ${v.internal_status === 'success' ? 'badge--success' : 'badge--warning'}`} style={{ fontSize: '.72rem' }}>
                    {v.internal_status === 'success' ? '✓' : '!'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
