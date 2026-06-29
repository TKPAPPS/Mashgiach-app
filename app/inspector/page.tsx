'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, QrCode, AlertTriangle, Calendar, User, LogOut, Trash2, History, Clock } from 'lucide-react'
import Image from 'next/image'
import { formatRelative, formatDate } from '@/lib/utils/format'
import PhotoAddControl from '@/components/ui/PhotoAddControl'
import type { Location, Profile, VisitLog } from '@/lib/supabase/types'

type LocationWithLastVisit = Location & { lastVisit?: VisitLog }
type ReplacementInspector = { id: string; full_name: string }

export default function InspectorHome() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationWithLastVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'home' | 'report' | 'scancorrect' | 'absence' | 'profile'>('home')

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const saved = localStorage.getItem('inspectorTab') as typeof activeTab | null
    if (saved) setActiveTab(saved)
  }, [])

  async function loadAll() {
    // getSession reads from cookie — no network round-trip. RLS enforces real auth on every DB call.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { router.push('/login'); return }
    const user = session.user
    setUserEmail(user.email ?? null)

    const [{ data: prof }, { data: il }, { data: recentVisits }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('inspector_locations').select('location_id, location:locations(id,name,city,address,status)').eq('inspector_id', user.id),
      supabase.from('visit_logs').select('id,action_type,location_id,created_at').eq('inspector_id', user.id).order('created_at', { ascending: false }).limit(50),
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

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto' }}>
      <header className="appHeader">
        <div className="appHeader__brand">
          <Image src="/logo.png" alt="The Kosher Place" width={100} height={56} priority className="appHeader__logo" />
        </div>
        <div className="appHeader__user" style={{ visibility: profile ? 'visible' : 'hidden' }}>
          <strong>{profile?.full_name ?? ''}</strong>
          <span>משגיח</span>
        </div>
        <div className="appHeader__actions">
          <button className="button button--icon button--ghost" onClick={logout}
            style={{ color: '#fff', border: 'none', opacity: .85 }} title="יציאה">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main style={{ padding: '16px 14px 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeTab === 'home' && (
          <>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>המקומות שלי</div>
            {loading
              ? <div className="emptyState"><span className="spinner" /></div>
              : locations.length === 0
              ? <div className="emptyState">לא שויכת למקומות עדיין.</div>
              : locations.map(loc => {
                const isInside = loc.lastVisit?.action_type === 'entry'
                const isInactive = loc.status !== 'active'
                return (
                  <div key={loc.id} className="locationCard"
                    style={isInactive ? { opacity: 0.55, cursor: 'default' } : undefined}
                    onClick={isInactive ? undefined : () => router.push(`/inspector/location/${loc.id}`)}>
                    <div className="locationCard__header">
                      <div className="locationCard__name">
                        <MapPin size={15} style={{ color: isInactive ? 'var(--muted)' : 'var(--primary)', flexShrink: 0 }} />
                        {loc.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {isInactive
                          ? <span className="badge badge--muted">לא פעיל</span>
                          : <span className={`badge ${isInside ? 'badge--success' : 'badge--muted'}`}>
                              {isInside ? 'בפנים' : 'בחוץ'}
                            </span>
                        }
                      </div>
                    </div>
                    {loc.city && <div className="locationCard__city">{loc.city}</div>}
                    {loc.address && <div className="locationCard__address">{loc.address}</div>}
                    {!isInactive && loc.lastVisit && (
                      <div className="locationCard__lastVisit">
                        ביקור אחרון: {formatRelative(loc.lastVisit.created_at)} •{' '}
                        {loc.lastVisit.action_type === 'entry' ? 'כניסה' : 'יציאה'}
                      </div>
                    )}
                  </div>
                )
              })
            }
            {/* One central scan action instead of a button per card */}
            <button className="scanFab" onClick={() => router.push('/inspector/scan')}>
              <QrCode size={20} /> סרוק QR
            </button>
          </>
        )}

        {activeTab === 'report' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 16 }}>דיווח ליקוי / הערה</div>
            {loading
              ? <div className="emptyState"><span className="spinner" /></div>
              : <ReportForm profile={profile} locations={locations} />}
          </div>
        )}

        {activeTab === 'absence' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 16 }}>בקשת היעדרות / חופש</div>
            {loading
              ? <div className="emptyState"><span className="spinner" /></div>
              : <AbsenceForm profile={profile} locations={locations} />}
          </div>
        )}

        {activeTab === 'scancorrect' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>דיווח על תיקון סריקה</div>
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '0 0 14px' }}>
              שכחת לסרוק יציאה, או ביקור שלא תועד כלל? בחר את סוג הדיווח, מלא את הזמנים המשוערים, והמנהל יאשר.
            </p>
            {loading
              ? <div className="emptyState"><span className="spinner" /></div>
              : <ScanCorrectionForm profile={profile} locations={locations} />}
          </div>
        )}

        {activeTab === 'profile' && profile && (
          <ProfileView profile={profile} email={userEmail} />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="bottomNav">
        {[
          { id: 'home', label: 'בית', Icon: MapPin },
          { id: 'report', label: 'ליקוי', Icon: AlertTriangle },
          { id: 'scancorrect', label: 'תיקון סריקה', Icon: Clock },
          { id: 'absence', label: 'היעדרות', Icon: Calendar },
          { id: 'profile', label: 'פרופיל', Icon: User },
        ].map(({ id, label, Icon }) => (
          <button key={id}
            className={`bottomNavItem${activeTab === id ? ' bottomNavItem--active' : ''}`}
            onClick={() => { const t = id as typeof activeTab; localStorage.setItem('inspectorTab', t); setActiveTab(t) }}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

type ReportPhoto = { id: string; url: string | null }

function ReportForm({ profile, locations }: { profile: Profile | null; locations: Location[] }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<ReportPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  // Images picked while still filling the form (no report_id yet); uploaded on submit.
  const [pending, setPending] = useState<{ file: File; url: string }[]>([])

  function addPending(files: FileList | null) {
    if (!files) return
    setPending(prev => {
      const room = 10 - prev.length
      const add = Array.from(files).slice(0, room).map(file => ({ file, url: URL.createObjectURL(file) }))
      return [...prev, ...add]
    })
  }

  function removePending(idx: number) {
    setPending(prev => {
      const target = prev[idx]
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/inspector/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id: fd.get('location_id') as string,
        report_type: fd.get('report_type') as string,
        description: fd.get('description') as string,
      }),
    })
    if (!res.ok) { setSaving(false); setError(true); setTimeout(() => setError(false), 4000); return }
    const data = await res.json()
    const newReportId: string | null = data.report_id ?? null

    // Upload any images the inspector attached while filling the form.
    const uploaded: ReportPhoto[] = []
    if (newReportId && pending.length > 0) {
      for (const { file } of pending) {
        const pf = new FormData()
        pf.append('report_id', newReportId)
        pf.append('file', file)
        const pres = await fetch('/api/inspector/report-photos', { method: 'POST', body: pf })
        if (pres.ok) uploaded.push(await pres.json())
      }
      pending.forEach(p => URL.revokeObjectURL(p.url))
      setPending([])
    }
    setSaving(false)
    setReportId(newReportId)
    setPhotos(uploaded)
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !reportId) return
    const remaining = 10 - photos.length
    const toUpload = Array.from(files).slice(0, remaining)
    setUploading(true)
    for (const file of toUpload) {
      const fd = new FormData()
      fd.append('report_id', reportId)
      fd.append('file', file)
      const res = await fetch('/api/inspector/report-photos', { method: 'POST', body: fd })
      if (res.ok) {
        const photo: ReportPhoto = await res.json()
        setPhotos(prev => [...prev, photo])
      }
    }
    setUploading(false)
  }

  async function handleDeletePhoto(photoId: string) {
    await fetch(`/api/inspector/report-photos?id=${photoId}`, { method: 'DELETE' })
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  function handleDone() {
    setReportId(null)
    setPhotos([])
  }

  if (error) return (
    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ color: 'var(--danger)', fontSize: '2rem' }}>✗</div>
      <div style={{ marginTop: 8, color: 'var(--danger)' }}>שגיאה בשליחה, נסה שנית</div>
    </div>
  )

  if (reportId) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
        <div style={{ color: 'var(--success)', fontSize: '2rem', marginBottom: 6 }}>✓</div>
        <div style={{ fontWeight: 600 }}>הדיווח נשלח בהצלחה</div>
        <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>ניתן לצרף תמונות לדיווח</div>
      </div>

      <div className="card">
        <div className="card__header"><div className="card__title">תמונות לדיווח ({photos.length}/10)</div></div>
        <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {photos.map(p => (
                <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--border)' }}>
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <button onClick={() => handleDeletePhoto(p.id)}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: 6, color: '#fff', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < 10 && (
            <PhotoAddControl onFiles={handleFiles} uploading={uploading} remaining={10 - photos.length} />
          )}
        </div>
      </div>

      <button className="button button--primary" onClick={handleDone}>סיים</button>
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

      {/* Attach images as part of the report (uploaded on submit) */}
      <div className="field">
        <span>תמונות ({pending.length}/10)</span>
        {pending.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
            {pending.map((p, i) => (
              <div key={p.url} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button type="button" onClick={() => removePending(i)}
                  style={{ position: 'absolute', top: 4, insetInlineEnd: 4, background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: 6, color: '#fff', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {pending.length < 10 && <PhotoAddControl onFiles={addPending} uploading={false} remaining={10 - pending.length} />}
      </div>

      <button className="button button--primary" type="submit" disabled={saving}>
        {saving ? <span className="spinner" /> : 'שלח דיווח'}
      </button>
    </form>
  )
}

function AbsenceForm({ profile, locations }: { profile: Profile | null; locations: Location[] }) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)
  const [type, setType] = useState('vacation')
  const [locationId, setLocationId] = useState('')
  const [replacementInspectors, setReplacementInspectors] = useState<ReplacementInspector[]>([])
  const [replacementLoading, setReplacementLoading] = useState(false)

  useEffect(() => {
    if (type !== 'replacement' || !locationId) {
      setReplacementInspectors([])
      return
    }
    let cancelled = false
    setReplacementLoading(true)
    fetch(`/api/inspector/replacements?location_id=${locationId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setReplacementInspectors(data.inspectors ?? [])
        setReplacementLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setReplacementInspectors([])
        setReplacementLoading(false)
      })
    return () => { cancelled = true }
  }, [type, locationId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/inspector/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_type: fd.get('request_type') as string,
        start_date: (fd.get('start_date') as string) || null,
        end_date: (fd.get('end_date') as string) || null,
        location_id: (fd.get('location_id') as string) || null,
        replacement_inspector_id: (fd.get('replacement_inspector_id') as string) || null,
        notes: (fd.get('notes') as string) || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setError(true)
      setTimeout(() => setError(false), 4000)
      return
    }
    setDone(true)
    setTimeout(() => setDone(false), 3000)
    ;(e.target as HTMLFormElement).reset()
    setType('vacation')
    setLocationId('')
    setReplacementInspectors([])
  }

  if (error) return (
    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ color: 'var(--danger)', fontSize: '2rem' }}>✗</div>
      <div style={{ marginTop: 8, color: 'var(--danger)' }}>שגיאה בשליחה, נסה שנית</div>
    </div>
  )

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
          <select name="location_id" value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">בחר מקום</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      {type === 'replacement' && locationId && (
        replacementLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '.85rem' }}>
            <span className="spinner" style={{ width: 14, height: 14 }} />
            <span>טוען משגיחים זמינים...</span>
          </div>
        ) : replacementInspectors.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: '4px 0' }}>
            אין משגיחים זמינים למיקום זה
          </div>
        ) : (
          <label className="field">
            <span>ממלא מקום</span>
            <select name="replacement_inspector_id">
              <option value="">בחר ממלא מקום</option>
              {replacementInspectors.map(i => (
                <option key={i.id} value={i.id}>{i.full_name}</option>
              ))}
            </select>
          </label>
        )
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

function ScanCorrectionForm({ profile, locations }: { profile: Profile | null; locations: Location[] }) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'missed_checkout' | 'missing_visit'>('missed_checkout')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return
    setError('')
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/inspector/scan-correction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id: (fd.get('location_id') as string) || null,
        correction_type: mode,
        est_entry: mode === 'missing_visit' ? (fd.get('est_entry') as string) || null : null,
        est_exit: (fd.get('est_exit') as string) || null,
        note: (fd.get('note') as string) || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'שגיאה בשליחה, נסה שנית')
      return
    }
    setDone(true)
    setTimeout(() => setDone(false), 3000)
    ;(e.target as HTMLFormElement).reset()
  }

  if (done) return (
    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ color: 'var(--success)', fontSize: '2rem' }}>✓</div>
      <div style={{ marginTop: 8 }}>הבקשה נשלחה לאישור המנהל</div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label className="field">
        <span>סוג הדיווח</span>
        <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
          <option value="missed_checkout">שכחתי לסרוק יציאה (הכניסה קיימת במערכת)</option>
          <option value="missing_visit">ביקור שלא תועד כלל (כניסה ויציאה)</option>
        </select>
      </label>
      <label className="field">
        <span>מקום *</span>
        <select name="location_id" required defaultValue="">
          <option value="" disabled>בחר מקום</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {mode === 'missing_visit' ? (
        <div className="fieldRow">
          <label className="field"><span>זמן כניסה משוער *</span><input name="est_entry" type="datetime-local" required /></label>
          <label className="field"><span>זמן יציאה משוער *</span><input name="est_exit" type="datetime-local" required /></label>
        </div>
      ) : (
        <label className="field"><span>זמן יציאה משוער *</span><input name="est_exit" type="datetime-local" required /></label>
      )}
      <label className="field">
        <span>הערה</span>
        <textarea name="note" rows={3} placeholder="פרטים נוספים..." />
      </label>
      {error && <div style={{ color: 'var(--danger)', fontSize: '.85rem' }}>{error}</div>}
      <button className="button button--primary" type="submit" disabled={saving}>
        {saving ? <span className="spinner" /> : 'שלח בקשת תיקון'}
      </button>
    </form>
  )
}

type SupabaseClient = ReturnType<typeof createClient>

type AbsenceRow = { id: string; request_type: string; start_date: string | null; end_date: string | null; admin_status: string; created_at: string }
type DeficiencyRow = { id: string; report_type: string; description: string; admin_status: string; created_at: string; location: { name: string } | null }

const STATUS_HE: Record<string, string> = { pending: 'ממתין', approved: 'אושר', denied: 'נדחה', open: 'פתוח', in_progress: 'בטיפול', resolved: 'טופל' }
const TYPE_HE: Record<string, string> = { vacation: 'חופשה', absence: 'היעדרות', replacement: 'החלפה', other: 'אחר', deficiency: 'ליקוי', note: 'הערה' }

function InspectorHistory({ supabase, inspectorId }: { supabase: SupabaseClient; inspectorId: string }) {
  const [absences, setAbsences] = useState<AbsenceRow[]>([])
  const [reports, setReports] = useState<DeficiencyRow[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('absence_requests')
      .select('id,request_type,start_date,end_date,admin_status,created_at')
      .eq('inspector_id', inspectorId)
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setAbsences((data ?? []) as AbsenceRow[]))
    supabase.from('deficiency_reports')
      .select('id,report_type,description,admin_status,created_at,location:locations(name)')
      .eq('inspector_id', inspectorId)
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setReports((data ?? []) as DeficiencyRow[]))
  }, [open, supabase, inspectorId])

  return (
    <div style={{ marginTop: 16, width: '100%' }}>
      <button className="button button--ghost" style={{ width: '100%', gap: 8 }} onClick={() => setOpen(o => !o)}>
        <History size={16} /> {open ? 'הסתר היסטוריה' : 'הצג בקשות ודיווחים שלי'}
      </button>
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 6 }}>בקשות היעדרות</p>
            {absences.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: '.82rem' }}>אין בקשות.</p>
              : absences.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <span>{TYPE_HE[a.request_type] ?? a.request_type}{a.start_date ? ` | ${a.start_date}` : ''}</span>
                  <span className={`badge badge--${a.admin_status === 'approved' ? 'success' : a.admin_status === 'denied' ? 'danger' : 'warning'}`} style={{ fontSize: '.72rem' }}>
                    {STATUS_HE[a.admin_status] ?? a.admin_status}
                  </span>
                </div>
              ))}
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 6 }}>דיווחים שלי</p>
            {reports.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: '.82rem' }}>אין דיווחים.</p>
              : reports.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{(r.location as { name: string } | null)?.name ?? '-'}</span>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{r.description.slice(0, 60)}</span>
                  </div>
                  <span className={`badge badge--${r.admin_status === 'resolved' ? 'success' : r.admin_status === 'in_progress' ? 'warning' : 'danger'}`} style={{ fontSize: '.72rem', flexShrink: 0 }}>
                    {STATUS_HE[r.admin_status] ?? r.admin_status}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileView({ profile, email }: { profile: Profile; email: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [pwOpen, setPwOpen] = useState(false)
  const [contractLoading, setContractLoading] = useState(false)

  async function openContract() {
    setContractLoading(true)
    try {
      const res = await fetch('/api/inspector/contract-url')
      if (!res.ok) return
      const { url } = await res.json()
      window.open(url, '_blank', 'noreferrer')
    } finally {
      setContractLoading(false)
    }
  }
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPw.length < 6) { setPwError('הסיסמה חייבת להכיל לפחות 6 תווים'); return }
    if (newPw !== confirmPw) { setPwError('הסיסמאות אינן תואמות'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (error) { setPwError(error.message); return }
    setPwSuccess(true)
    setNewPw('')
    setConfirmPw('')
    setTimeout(() => { setPwSuccess(false); setPwOpen(false) }, 3000)
  }

  function closePwForm() {
    setPwOpen(false)
    setPwError('')
    setPwSuccess(false)
    setNewPw('')
    setConfirmPw('')
  }

  return (
    <div className="profileCard">
      <div className="profileCard__avatar">{profile.full_name.charAt(0)}</div>
      <div className="profileCard__name">{profile.full_name}</div>
      <div className="profileCard__role">משגיח</div>
      {email && (
        <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>{email}</div>
      )}
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
        <button className="button button--ghost" style={{ marginTop: 16 }}
          onClick={openContract} disabled={contractLoading}>
          {contractLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'צפה בחוזה'}
        </button>
      )}

      <InspectorHistory supabase={supabase} inspectorId={profile.id} />

      <div style={{ marginTop: 20, width: '100%' }}>
        {!pwOpen ? (
          <button className="button button--ghost" style={{ width: '100%' }}
            onClick={() => setPwOpen(true)}>
            שנה סיסמה
          </button>
        ) : (
          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pwSuccess && (
              <div style={{ color: 'var(--success)', textAlign: 'center', fontSize: '.9rem', padding: '6px 0' }}>
                הסיסמה שונתה בהצלחה
              </div>
            )}
            {pwError && (
              <div style={{ color: 'var(--danger)', fontSize: '.85rem' }}>{pwError}</div>
            )}
            <label className="field">
              <span>סיסמה חדשה</span>
              <input type="password" value={newPw}
                onChange={e => { setNewPw(e.target.value); setPwError('') }}
                placeholder="לפחות 6 תווים" />
            </label>
            <label className="field">
              <span>אימות סיסמה</span>
              <input type="password" value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setPwError('') }}
                placeholder="הכנס שוב את הסיסמה" />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button button--primary" type="submit" disabled={pwSaving} style={{ flex: 1 }}>
                {pwSaving ? <span className="spinner" /> : 'שמור סיסמה'}
              </button>
              <button className="button button--ghost" type="button" onClick={closePwForm}>
                ביטול
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
