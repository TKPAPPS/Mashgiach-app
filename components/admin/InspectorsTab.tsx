'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, Upload, ExternalLink, Eye, KeyRound } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils/format'
import type { Profile } from '@/lib/supabase/types'
import type { SharedLocation } from './AdminShell'

type Props = {
  refreshKey: number
  locations: SharedLocation[]
  emailMap: Record<string, string | null>
}

export default function InspectorsTab({ refreshKey, locations, emailMap }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [inspectors, setInspectors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editInsp, setEditInsp] = useState<Profile | null>(null)
  const [detailInsp, setDetailInsp] = useState<Profile | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetInsp, setResetInsp] = useState<Profile | null>(null)
  const [assignedLocs, setAssignedLocs] = useState<Record<string, string[]>>({})
  const [contractLoading, setContractLoading] = useState<Record<string, boolean>>({})
  const [localEmailMap, setLocalEmailMap] = useState<Record<string, string | null>>(emailMap)

  useEffect(() => { loadAll() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    const [{ data: insp }, { data: il }, emailsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'mashgiach').order('full_name'),
      supabase.from('inspector_locations').select('inspector_id,location_id'),
      fetch('/api/admin/users'),
    ])
    setInspectors((insp ?? []) as Profile[])
    const map: Record<string, string[]> = {}
    for (const row of (il ?? [])) {
      if (!map[row.inspector_id]) map[row.inspector_id] = []
      map[row.inspector_id].push(row.location_id)
    }
    setAssignedLocs(map)
    if (emailsRes.ok) {
      const list: { id: string; email: string | null }[] = await emailsRes.json()
      const em: Record<string, string | null> = {}
      for (const e of list) em[e.id] = e.email
      setLocalEmailMap(em)
    }
    setLoading(false)
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    const password = fd.get('password') as string
    const full_name = fd.get('full_name') as string
    const start_date = fd.get('start_date') as string || null
    const vacation_days = Number(fd.get('vacation_days') || 0)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name, start_date, vacation_days_remaining: vacation_days }),
    })
    const json = await res.json()
    if (!res.ok) { toast(json.error ?? 'שגיאה ביצירת משתמש', 'error') }
    else { toast('המשגיח נוסף בהצלחה', 'success'); setAddOpen(false); loadAll() }
    setSaving(false)
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editInsp) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const newEmail = (fd.get('email') as string).trim()
    const currentEmail = localEmailMap[editInsp.id] ?? ''

    const { error } = await supabase.from('profiles').update({
      full_name: fd.get('full_name') as string,
      start_date: (fd.get('start_date') as string) || null,
      vacation_days_remaining: Number(fd.get('vacation_days') || 0),
    }).eq('id', editInsp.id)
    if (error) { toast('שגיאה בעדכון', 'error'); setSaving(false); return }

    if (newEmail && newEmail !== currentEmail) {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editInsp.id, email: newEmail }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast(json.error ?? 'שגיאה בעדכון אימייל', 'error')
        setSaving(false)
        return
      }
    }

    toast('עודכן בהצלחה', 'success')
    setEditInsp(null)
    loadAll()
    setSaving(false)
  }

  async function handleResetCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!resetInsp) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const email = (fd.get('email') as string).trim()
    const password = (fd.get('password') as string).trim()
    if (!email && !password) { toast('יש להזין אימייל או סיסמה חדשים', 'error'); setSaving(false); return }
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resetInsp.id, email: email || undefined, password: password || undefined }),
    })
    const json = await res.json()
    if (!res.ok) toast(json.error ?? 'שגיאה בעדכון פרטי כניסה', 'error')
    else { toast('פרטי הכניסה עודכנו בהצלחה', 'success'); setResetInsp(null) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    const res = await fetch(`/api/admin/users?id=${deleteId}`, { method: 'DELETE' })
    if (!res.ok) toast('שגיאה במחיקה', 'error')
    else { toast('המשגיח נמחק', 'success'); loadAll() }
    setDeleteId(null)
  }

  async function uploadContract(inspId: string, file: File) {
    const path = `contracts/${inspId}/${file.name}`
    const { error } = await supabase.storage.from('contracts').upload(path, file, { upsert: true })
    if (error) { toast('שגיאה בהעלאה', 'error'); return }
    await supabase.from('profiles').update({ contract_url: path }).eq('id', inspId)
    setInspectors(prev => prev.map(i => i.id === inspId ? { ...i, contract_url: path } : i))
    toast('חוזה הועלה', 'success')
  }

  async function openContract(inspId: string) {
    setContractLoading(prev => ({ ...prev, [inspId]: true }))
    try {
      const res = await fetch(`/api/admin/contract-url?inspector_id=${inspId}`)
      if (!res.ok) { toast('שגיאה בפתיחת החוזה', 'error'); return }
      const { url } = await res.json()
      window.open(url, '_blank', 'noreferrer')
    } finally {
      setContractLoading(prev => ({ ...prev, [inspId]: false }))
    }
  }

  async function toggleLocAssign(inspId: string, locId: string) {
    const current = assignedLocs[inspId] ?? []
    if (current.includes(locId)) {
      await supabase.from('inspector_locations').delete()
        .eq('inspector_id', inspId).eq('location_id', locId)
      setAssignedLocs(prev => ({ ...prev, [inspId]: (prev[inspId] ?? []).filter(l => l !== locId) }))
    } else {
      await supabase.from('inspector_locations').insert({ inspector_id: inspId, location_id: locId })
      setAssignedLocs(prev => ({ ...prev, [inspId]: [...(prev[inspId] ?? []), locId] }))
    }
  }

  const detailAssigned = detailInsp ? (assignedLocs[detailInsp.id] ?? []) : []

  return (
    <div>
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">משגיחים</div>
          <button className="button button--primary button--sm" onClick={() => setAddOpen(true)}>
            <Plus size={15} /> הוסף משגיח
          </button>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          inspectors.length === 0 ? <div className="emptyState">אין משגיחים.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>שם</th><th>אימייל</th><th>תאריך התחלה</th><th>ימי חופש</th><th>מקומות</th><th>חוזה</th><th></th></tr>
              </thead>
              <tbody>
                {inspectors.map(insp => (
                  <tr key={insp.id}>
                    <td><strong>{insp.full_name}</strong></td>
                    <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{localEmailMap[insp.id] ?? <span className="mutedCell">-</span>}</td>
                    <td>{insp.start_date ? formatDate(insp.start_date) : <span className="mutedCell">-</span>}</td>
                    <td>{insp.vacation_days_remaining}</td>
                    <td>
                      <span className="badge badge--info">
                        {(assignedLocs[insp.id] ?? []).length} מקומות
                      </span>
                    </td>
                    <td>
                      {insp.contract_url
                        ? <button className="button button--ghost button--sm"
                            onClick={() => openContract(insp.id)}
                            disabled={contractLoading[insp.id]}>
                            {contractLoading[insp.id] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <ExternalLink size={13} />} צפה
                          </button>
                        : <span className="mutedCell">אין</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="button button--icon button--ghost" title="פרטים"
                          onClick={() => setDetailInsp(insp)}><Eye size={15} /></button>
                        <button className="button button--icon button--ghost" title="עריכת פרופיל"
                          onClick={() => setEditInsp(insp)}><Pen size={15} /></button>
                        <button className="button button--icon button--ghost" title="איפוס סיסמה / אימייל"
                          onClick={() => setResetInsp(insp)}><KeyRound size={15} /></button>
                        <button className="button button--icon button--ghost" title="מחיקה"
                          style={{ color: 'var(--danger)' }} onClick={() => setDeleteId(insp.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      </div>

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="הוספת משגיח"
        footer={<>
          <button className="button button--ghost" onClick={() => setAddOpen(false)}>ביטול</button>
          <button className="button button--primary" type="submit" form="insp-add-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'צור משגיח'}
          </button>
        </>}>
        <form id="insp-add-form" onSubmit={handleCreateUser} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field"><span>שם מלא *</span><input name="full_name" required autoComplete="off" /></label>
          <label className="field"><span>אימייל *</span><input name="email" type="email" required autoComplete="off" /></label>
          <label className="field"><span>סיסמה זמנית *</span><input name="password" type="password" required minLength={6} autoComplete="new-password" /></label>
          <div className="fieldRow">
            <label className="field"><span>תאריך התחלה</span><input name="start_date" type="date" /></label>
            <label className="field"><span>ימי חופש</span><input name="vacation_days" type="number" min={0} defaultValue={0} /></label>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editInsp} onClose={() => setEditInsp(null)} title="עריכת משגיח"
        footer={<>
          <button className="button button--ghost" onClick={() => setEditInsp(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="insp-edit-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור'}
          </button>
        </>}>
        {editInsp && (
          <form id="insp-edit-form" onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field"><span>שם מלא</span><input name="full_name" required defaultValue={editInsp.full_name} /></label>
            <label className="field"><span>אימייל</span><input name="email" type="email" defaultValue={localEmailMap[editInsp.id] ?? ''} /></label>
            <div className="fieldRow">
              <label className="field"><span>תאריך התחלה</span><input name="start_date" type="date" defaultValue={editInsp.start_date ?? ''} /></label>
              <label className="field"><span>ימי חופש</span><input name="vacation_days" type="number" min={0} defaultValue={editInsp.vacation_days_remaining} /></label>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2px 0' }} />
            <div>
              <p style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>שיוך מקומות</p>
              {locations.length === 0
                ? <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>אין מקומות מוגדרים.</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {locations.map(loc => {
                      const assigned = (assignedLocs[editInsp.id] ?? []).includes(loc.id)
                      return (
                        <div key={loc.id}
                          className={`checklistAdminItem${assigned ? '' : ' checklistAdminItem--inactive'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleLocAssign(editInsp.id, loc.id)}>
                          <input type="checkbox" checked={assigned} readOnly
                            style={{ accentColor: 'var(--primary)', cursor: 'pointer' }} />
                          <span className="checklistAdminItem__name">{loc.name}</span>
                          {loc.city && <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{loc.city}</span>}
                          {loc.status !== 'active' && <span className="badge badge--muted" style={{ fontSize: '.7rem' }}>לא פעיל</span>}
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          </form>
        )}
      </Modal>

      {/* Reset credentials modal */}
      <Modal open={!!resetInsp} onClose={() => setResetInsp(null)} title={`פרטי כניסה: ${resetInsp?.full_name ?? ''}`}
        footer={<>
          <button className="button button--ghost" onClick={() => setResetInsp(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="insp-reset-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'עדכן פרטי כניסה'}
          </button>
        </>}>
        {resetInsp && (
          <form id="insp-reset-form" onSubmit={handleResetCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: '.875rem', color: 'var(--muted)' }}>
              השאר שדה ריק כדי לא לשנות אותו. לפחות אחד מהשדות חייב להיות מלא.
            </p>
            <label className="field"><span>אימייל חדש</span><input name="email" type="email" placeholder="השאר ריק לאי-שינוי" /></label>
            <label className="field"><span>סיסמה חדשה</span><input name="password" type="password" placeholder="השאר ריק לאי-שינוי" minLength={6} /></label>
          </form>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת משגיח"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteId(null)}>ביטול</button>
          <button className="button button--danger" onClick={handleDelete}>מחק</button>
        </>}>
        <p>האם אתה בטוח שברצונך למחוק משגיח זה? הפעולה אינה הפיכה.</p>
      </Modal>

      {/* Detail / contract / locations modal */}
      {detailInsp && (
        <Modal open onClose={() => setDetailInsp(null)} title={detailInsp.full_name} size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><span>תאריך התחלה</span>
                <div>{detailInsp.start_date ? formatDate(detailInsp.start_date) : '-'}</div>
              </div>
              <div className="field"><span>ימי חופש</span>
                <div>{detailInsp.vacation_days_remaining}</div>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><span>אימייל</span>
                <div style={{ fontSize: '.9rem', direction: 'ltr', textAlign: 'right' }}>
                  {localEmailMap[detailInsp.id] ?? '-'}
                </div>
              </div>
            </div>

            {/* Contract upload */}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>חוזה עבודה</div>
              {detailInsp.contract_url && (
                <div className="filePreview" style={{ marginBottom: 10 }}>
                  <span>חוזה קיים</span>
                  <button className="button button--ghost button--sm"
                    onClick={() => openContract(detailInsp.id)}
                    disabled={contractLoading[detailInsp.id]}>
                    {contractLoading[detailInsp.id] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <ExternalLink size={13} />} פתח
                  </button>
                </div>
              )}
              <label className="fileUpload">
                <div className="fileUpload__area">
                  <Upload size={18} style={{ margin: '0 auto 4px' }} />
                  <div style={{ fontSize: '.82rem' }}>{detailInsp.contract_url ? 'החלף חוזה' : 'העלה חוזה'}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>PDF או תמונה</div>
                  <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files?.[0]) uploadContract(detailInsp.id, e.target.files[0])
                    }} />
                </div>
              </label>
            </div>

            {/* Location assignment */}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>שיוך מקומות</div>
              <p className="textSm textMuted" style={{ marginBottom: 8 }}>לחץ להוסיף/הסיר שיוך</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {locations.map(loc => {
                  const assigned = detailAssigned.includes(loc.id)
                  return (
                    <div key={loc.id}
                      className={`checklistAdminItem${assigned ? '' : ' checklistAdminItem--inactive'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleLocAssign(detailInsp.id, loc.id)}>
                      <input type="checkbox" readOnly checked={assigned}
                        style={{ accentColor: 'var(--primary)' }} />
                      <span className="checklistAdminItem__name">{loc.name}</span>
                      {loc.city && <span className="textMuted textSm">{loc.city}</span>}
                      {assigned && <span className="badge badge--success">משויך</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
