'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, QrCode, AlertTriangle, Calendar, User, LogOut } from 'lucide-react'
import { formatRelative, formatDate } from '@/lib/utils/format'
import type { Location, Profile, VisitLog } from '@/lib/supabase/types'

type LocationWithLastVisit = Location & { lastVisit?: VisitLog }

export default function InspectorHome() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [locations, setLocations] = useState<LocationWithLastVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'home' | 'report' | 'absence' | 'profile'>('home')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: prof }, { data: il }, { data: recentVisits }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('inspector_locations').select('location_id, location:locations(*)').eq('inspector_id', user.id),
      supabase.from('visit_logs').select('*').eq('inspector_id', user.id).order('created_at', { ascending: false }).limit(50),
    ])

    setProfile(prof as Profile)

    const locs = ((il ?? []).map((r: { location: unknown }) => r.location as Location)).filter(Boolean)
    const visitMap: Record<string, VisitLog> = {}
    for (const v of (recentVisits ?? []) as VisitLog[]) {
      if (v.location_id && !visitMap[v.location_id]) visitMap[v.location_id] = v
    }

    setLocations(locs.map(l => ({ ...l, lastVisit: visitMap[l.id] })))
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto' }}>
      <header className="appHeader">
        <div className="appHeader__brand">
          <div className="appHeader__title">מעקב כשרות</div>
        </div>
        {profile && (
          <div className="appHeader__user">
            <strong>{profile.full_name}</strong>
          </div>
        )}
        <div className="appHeader__actions">
          <button className="button button--icon button--ghost" onClick={logout}
            style={{ color: '#fff', border: 'none' }} title="יציאה">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main style={{ padding: '16px 14px 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeTab === 'home' && (
          <>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>המקומות שלי</div>
            {locations.length === 0
              ? <div className="emptyState">לא שויכת למקומות עדיין.</div>
              : locations.map(loc => (
                <div key={loc.id} className="locationCard"
                  onClick={() => router.push(`/inspector/location/${loc.id}`)}>
                  <div className="locationCard__header">
                    <div className="locationCard__name">
                      <MapPin size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      {loc.name}
                    </div>
                    <span className={`badge ${loc.status === 'active' ? 'badge--success' : 'badge--muted'}`}>
                      {loc.status === 'active' ? 'פעיל' : 'לא פעיל'}
                    </span>
                  </div>
                  {loc.city && <div className="locationCard__city">{loc.city}</div>}
                  {loc.address && <div className="locationCard__address">{loc.address}</div>}
                  {loc.lastVisit && (
                    <div className="locationCard__lastVisit">
                      ביקור אחרון: {formatRelative(loc.lastVisit.created_at)} •{' '}
                      {loc.lastVisit.action_type === 'entry' ? 'כניסה' : 'יציאה'}
                    </div>
                  )}
                  <button
                    className="button button--primary"
                    style={{ marginTop: 10, width: '100%' }}
                    onClick={e => { e.stopPropagation(); router.push('/inspector/scan') }}>
                    <QrCode size={15} /> סרוק QR
                  </button>
                </div>
              ))
            }
          </>
        )}

        {activeTab === 'report' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 16 }}>דיווח ליקוי / הערה</div>
            <ReportForm profile={profile} locations={locations} />
          </div>
        )}

        {activeTab === 'absence' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 16 }}>בקשת היעדרות / חופש</div>
            <AbsenceForm profile={profile} locations={locations} />
          </div>
        )}

        {activeTab === 'profile' && profile && (
          <ProfileView profile={profile} />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="bottomNav">
        {[
          { id: 'home', label: 'בית', Icon: MapPin },
          { id: 'report', label: 'ליקוי', Icon: AlertTriangle },
          { id: 'absence', label: 'היעדרות', Icon: Calendar },
          { id: 'profile', label: 'פרופיל', Icon: User },
        ].map(({ id, label, Icon }) => (
          <button key={id}
            className={`bottomNavItem${activeTab === id ? ' bottomNavItem--active' : ''}`}
            onClick={() => setActiveTab(id as typeof activeTab)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function ReportForm({ profile, locations }: { profile: Profile | null; locations: Location[] }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    await supabase.from('deficiency_reports').insert({
      inspector_id: profile.id,
      location_id: fd.get('location_id') as string,
      report_type: (fd.get('report_type') as 'deficiency' | 'note') ?? 'deficiency',
      description: fd.get('description') as string,
      admin_status: 'open' as const,
      admin_notes: null,
    })
    setSaving(false)
    setDone(true)
    setTimeout(() => setDone(false), 3000)
    ;(e.target as HTMLFormElement).reset()
  }

  if (done) return (
    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ color: 'var(--success)', fontSize: '2rem' }}>✓</div>
      <div style={{ marginTop: 8 }}>הדיווח נשלח בהצלחה</div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label className="field">
        <span>מקום *</span>
        <select name="location_id" required>
          <option value="">בחר מקום</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>סוג דיווח *</span>
        <select name="report_type" required>
          <option value="deficiency">ליקוי כשרות</option>
          <option value="note">הערה כללית</option>
        </select>
      </label>
      <label className="field">
        <span>פירוט *</span>
        <textarea name="description" required rows={5} placeholder="תאר את הליקוי או ההערה..." />
      </label>
      <button className="button button--primary" type="submit" disabled={saving}>
        {saving ? <span className="spinner" /> : 'שלח דיווח'}
      </button>
    </form>
  )
}

function AbsenceForm({ profile, locations }: { profile: Profile | null; locations: Location[] }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [type, setType] = useState('vacation')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    await supabase.from('absence_requests').insert({
      inspector_id: profile.id,
      request_type: (fd.get('request_type') as 'vacation' | 'absence' | 'replacement' | 'other') ?? 'vacation',
      start_date: (fd.get('start_date') as string) || null,
      end_date: (fd.get('end_date') as string) || null,
      location_id: (fd.get('location_id') as string) || null,
      notes: (fd.get('notes') as string) || null,
      replacement_inspector_id: null,
    })
    setSaving(false)
    setDone(true)
    setTimeout(() => setDone(false), 3000)
    ;(e.target as HTMLFormElement).reset()
    setType('vacation')
  }

  if (done) return (
    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ color: 'var(--success)', fontSize: '2rem' }}>✓</div>
      <div style={{ marginTop: 8 }}>הבקשה נשלחה בהצלחה</div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label className="field">
        <span>סוג בקשה *</span>
        <select name="request_type" required value={type} onChange={e => setType(e.target.value)}>
          <option value="vacation">חופשה</option>
          <option value="absence">היעדרות</option>
          <option value="replacement">החלפה</option>
          <option value="other">אחר</option>
        </select>
      </label>
      <div className="fieldRow">
        <label className="field"><span>מתאריך</span><input name="start_date" type="date" /></label>
        <label className="field"><span>עד תאריך</span><input name="end_date" type="date" /></label>
      </div>
      {(type === 'replacement' || type === 'absence') && (
        <label className="field">
          <span>מקום</span>
          <select name="location_id">
            <option value="">בחר מקום</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>הערות</span>
        <textarea name="notes" rows={4} placeholder="פרטים נוספים..." />
      </label>
      <button className="button button--primary" type="submit" disabled={saving}>
        {saving ? <span className="spinner" /> : 'שלח בקשה'}
      </button>
    </form>
  )
}

function ProfileView({ profile }: { profile: Profile }) {
  return (
    <div className="profileCard">
      <div className="profileCard__avatar">
        {profile.full_name.charAt(0)}
      </div>
      <div className="profileCard__name">{profile.full_name}</div>
      <div className="profileCard__role">משגיח</div>
      <div className="profileCard__stats">
        <div className="profileCard__stat">
          <span>{profile.vacation_days_remaining}</span>
          <small>ימי חופש</small>
        </div>
        <div className="profileCard__stat">
          <span>{profile.start_date ? formatDate(profile.start_date) : '-'}</span>
          <small>תאריך התחלה</small>
        </div>
      </div>
      {profile.contract_url && (
        <a href={profile.contract_url} target="_blank" rel="noreferrer"
          className="button button--ghost" style={{ marginTop: 16 }}>
          צפה בחוזה
        </a>
      )}
    </div>
  )
}
