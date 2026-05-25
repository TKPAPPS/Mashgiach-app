'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ShieldCheck, RefreshCw, LogOut,
  CalendarDays, MapPin, Users, FileText,
  AlertTriangle, CheckSquare, ScrollText, List
} from 'lucide-react'
import type { Profile } from '@/lib/supabase/types'

import DashboardTab    from './DashboardTab'
import LocationsTab    from './LocationsTab'
import InspectorsTab   from './InspectorsTab'
import ReportsTab      from './ReportsTab'
import DeficienciesTab from './DeficienciesTab'
import ChecklistAdmin  from './ChecklistAdmin'
import AbsencesTab     from './AbsencesTab'
import SystemLogsTab   from './SystemLogsTab'

type Tab = 'dashboard' | 'locations' | 'inspectors' | 'reports' | 'deficiencies' | 'checklist' | 'absences' | 'logs'

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'dashboard',    label: 'דשבורד',        Icon: CalendarDays },
  { id: 'locations',    label: 'מקומות',         Icon: MapPin },
  { id: 'inspectors',   label: 'משגיחים',        Icon: Users },
  { id: 'reports',      label: 'דיווחים',        Icon: FileText },
  { id: 'deficiencies', label: 'ליקויי כשרות',   Icon: AlertTriangle },
  { id: 'absences',     label: 'היעדרויות',      Icon: CalendarDays },
  { id: 'checklist',    label: 'רשימת בדיקות',   Icon: CheckSquare },
  { id: 'logs',         label: 'לוגים',          Icon: ScrollText },
]

export default function AdminShell() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function refresh() { setRefreshKey(k => k + 1) }

  return (
    <div className="app">
      <header className="appHeader">
        <div className="appHeader__brand">
          <ShieldCheck size={18} className="appHeader__icon" aria-hidden />
          <div className="appHeader__title">דשבורד מנהל</div>
        </div>
        {profile && (
          <div className="appHeader__user">
            <strong>{profile.full_name}</strong>
            <span>מנהל</span>
          </div>
        )}
        <div className="appHeader__actions">
          <button className="button button--icon button--ghost" onClick={refresh} aria-label="רענון" title="רענון"
            style={{ color: '#fff', border: 'none' }}>
            <RefreshCw size={16} />
          </button>
          <button className="button button--icon button--ghost" onClick={logout} aria-label="יציאה" title="יציאה"
            style={{ color: '#fff', border: 'none' }}>
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
              onClick={() => setTab(id)}
              type="button"
            >
              <Icon size={15} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {tab === 'dashboard'    && <DashboardTab    key={refreshKey} />}
        {tab === 'locations'    && <LocationsTab    key={refreshKey} />}
        {tab === 'inspectors'   && <InspectorsTab   key={refreshKey} />}
        {tab === 'reports'      && <ReportsTab      key={refreshKey} />}
        {tab === 'deficiencies' && <DeficienciesTab key={refreshKey} />}
        {tab === 'absences'     && <AbsencesTab     key={refreshKey} />}
        {tab === 'checklist'    && <ChecklistAdmin  key={refreshKey} />}
        {tab === 'logs'         && <SystemLogsTab   key={refreshKey} />}
      </main>
    </div>
  )
}
