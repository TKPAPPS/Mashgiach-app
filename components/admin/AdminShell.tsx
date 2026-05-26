'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, LogOut,
  CalendarDays, MapPin, Users, FileText,
  AlertTriangle, CheckSquare, ScrollText, ShieldCheck, ClipboardList
} from 'lucide-react'
import Image from 'next/image'
import type { Profile } from '@/lib/supabase/types'

import DashboardTab    from './DashboardTab'
import LocationsTab    from './LocationsTab'
import InspectorsTab   from './InspectorsTab'
import ReportsTab      from './ReportsTab'
import DeficienciesTab from './DeficienciesTab'
import ChecklistAdmin  from './ChecklistAdmin'
import AbsencesTab     from './AbsencesTab'
import SystemLogsTab   from './SystemLogsTab'
import AdminsTab       from './AdminsTab'
import AdminReportTab  from './AdminReportTab'

export type SharedInspector = { id: string; full_name: string }
export type SharedLocation   = { id: string; name: string; city: string | null; status: string }
export type SharedIL         = { inspector_id: string; location_id: string }

type Tab = 'dashboard' | 'locations' | 'inspectors' | 'reports' | 'deficiencies' | 'checklist' | 'absences' | 'logs' | 'admins' | 'adminreports'

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'dashboard',    label: 'דשבורד',        Icon: CalendarDays },
  { id: 'locations',    label: 'מקומות',         Icon: MapPin },
  { id: 'inspectors',   label: 'משגיחים',        Icon: Users },
  { id: 'reports',      label: 'דיווחים',        Icon: FileText },
  { id: 'deficiencies', label: 'ליקויי כשרות',   Icon: AlertTriangle },
  { id: 'absences',     label: 'היעדרויות',      Icon: CalendarDays },
  { id: 'checklist',    label: 'רשימת בדיקות',   Icon: CheckSquare },
  { id: 'logs',         label: 'לוגים',          Icon: ScrollText },
  { id: 'admins',       label: 'מנהלים',         Icon: ShieldCheck },
  { id: 'adminreports', label: 'דוח מנהל',       Icon: ClipboardList },
]

export default function AdminShell() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(['dashboard'] as Tab[]))
  const [profile, setProfile] = useState<Profile | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [sharedInspectors, setSharedInspectors] = useState<SharedInspector[]>([])
  const [sharedLocations,  setSharedLocations]  = useState<SharedLocation[]>([])
  const [sharedIL,         setSharedIL]         = useState<SharedIL[]>([])
  const [emailMap,         setEmailMap]         = useState<Record<string, string | null>>({})

  useEffect(() => {
    const saved = localStorage.getItem('adminTab') as Tab | null
    if (saved) {
      setTab(saved)
      setMountedTabs(prev => new Set([...prev, saved]))
    }
  }, [])

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
      setProfile({ id: 'dev', full_name: 'מנהל', role: 'admin',
        start_date: null, vacation_days_remaining: 0, contract_url: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      return
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
    loadShared()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadShared() {
    // Fast path: core lookup data (no auth API call)
    const [{ data: insp }, { data: locs }, { data: il }] = await Promise.all([
      supabase.from('profiles').select('id,full_name').eq('role', 'mashgiach').order('full_name'),
      supabase.from('locations').select('id,name,city,status').order('name'),
      supabase.from('inspector_locations').select('inspector_id,location_id'),
    ])
    setSharedInspectors((insp ?? []) as SharedInspector[])
    setSharedLocations((locs ?? []) as SharedLocation[])
    setSharedIL((il ?? []) as SharedIL[])

    // Slow path: auth email list (non-blocking, updates emailMap when ready)
    fetch('/api/admin/users').then(async emailsRes => {
      if (!emailsRes.ok) return
      const emailList: { id: string; email: string | null }[] = await emailsRes.json()
      const em: Record<string, string | null> = {}
      for (const e of emailList) em[e.id] = e.email
      setEmailMap(em)
    }).catch(() => {/* non-critical */})
  }

  function handleTabChange(newTab: Tab) {
    localStorage.setItem('adminTab', newTab)
    setTab(newTab)
    setMountedTabs(prev => new Set([...prev, newTab]))
  }

  async function logout() {
    if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') return
    await supabase.auth.signOut()
    router.push('/login')
  }

  function refresh() {
    setRefreshKey(k => k + 1)
    loadShared()
  }

  return (
    <div className="app">
      <header className="appHeader">
        <div className="appHeader__brand">
          <Image
            src="/logo.png"
            alt="The Kosher Place"
            width={120}
            height={68}
            priority
            className="appHeader__logo"
          />
          {process.env.NEXT_PUBLIC_DEV_BYPASS === 'true' && (
            <span style={{ fontSize: '.65rem', background: 'var(--gold)', color: '#fff', padding: '2px 7px', borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>DEV</span>
          )}
        </div>
        <div className="appHeader__user" style={{ visibility: profile ? 'visible' : 'hidden' }}>
          <strong>{profile?.full_name ?? ''}</strong>
          <span>מנהל</span>
        </div>
        <div className="appHeader__actions">
          <button className="button button--icon button--ghost" onClick={refresh} aria-label="רענון" title="רענון"
            style={{ color: '#fff', border: 'none', opacity: .85 }}>
            <RefreshCw size={16} />
          </button>
          <button className="button button--icon button--ghost" onClick={logout} aria-label="יציאה" title="יציאה"
            style={{ color: '#fff', border: 'none', opacity: .85 }}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="appMain">
        <div className="adminTabs" role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`adminTab${tab === id ? ' adminTab--active' : ''}`}
              role="tab"
              aria-selected={tab === id}
              onClick={() => handleTabChange(id)}
              type="button"
            >
              <Icon size={15} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {mountedTabs.has('dashboard') && (
          <div style={{ display: tab === 'dashboard' ? undefined : 'none' }}>
            <DashboardTab refreshKey={refreshKey} inspectors={sharedInspectors} locations={sharedLocations} />
          </div>
        )}
        {mountedTabs.has('locations') && (
          <div style={{ display: tab === 'locations' ? undefined : 'none' }}>
            <LocationsTab refreshKey={refreshKey} />
          </div>
        )}
        {mountedTabs.has('inspectors') && (
          <div style={{ display: tab === 'inspectors' ? undefined : 'none' }}>
            <InspectorsTab refreshKey={refreshKey} locations={sharedLocations} emailMap={emailMap} />
          </div>
        )}
        {mountedTabs.has('reports') && (
          <div style={{ display: tab === 'reports' ? undefined : 'none' }}>
            <ReportsTab refreshKey={refreshKey} inspectors={sharedInspectors} locations={sharedLocations} />
          </div>
        )}
        {mountedTabs.has('deficiencies') && (
          <div style={{ display: tab === 'deficiencies' ? undefined : 'none' }}>
            <DeficienciesTab refreshKey={refreshKey} inspectors={sharedInspectors} locations={sharedLocations} />
          </div>
        )}
        {mountedTabs.has('absences') && (
          <div style={{ display: tab === 'absences' ? undefined : 'none' }}>
            <AbsencesTab refreshKey={refreshKey} inspectors={sharedInspectors} inspectorLocations={sharedIL} />
          </div>
        )}
        {mountedTabs.has('checklist') && (
          <div style={{ display: tab === 'checklist' ? undefined : 'none' }}>
            <ChecklistAdmin refreshKey={refreshKey} />
          </div>
        )}
        {mountedTabs.has('logs') && (
          <div style={{ display: tab === 'logs' ? undefined : 'none' }}>
            <SystemLogsTab refreshKey={refreshKey} />
          </div>
        )}
        {mountedTabs.has('admins') && (
          <div style={{ display: tab === 'admins' ? undefined : 'none' }}>
            <AdminsTab refreshKey={refreshKey} emailMap={emailMap} currentUserId={profile?.id ?? null} />
          </div>
        )}
        {mountedTabs.has('adminreports') && (
          <div style={{ display: tab === 'adminreports' ? undefined : 'none' }}>
            <AdminReportTab refreshKey={refreshKey} locations={sharedLocations} />
          </div>
        )}
      </main>
    </div>
  )
}
