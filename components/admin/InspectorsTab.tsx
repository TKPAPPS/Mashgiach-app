'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, Upload, ExternalLink, Eye } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils/format'
import type { Profile, Location } from '@/lib/supabase/types'

export default function InspectorsTab() {
  const supabase = createClient()
  const { toast } = useToast()
  const [inspectors, setInspectors] = useState<Profile[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editInsp, setEditInsp] = useState<Profile | null>(null)
  const [detailInsp, setDetailInsp] = useState<Profile | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [assignedLocs, setAssignedLocs] = useState<Record<string, string[]>>({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: insp }, { data: locs }, { data: il }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'mashgiach').order('full_name'),
      supabase.from('locations').select('id,name,city,status').order('name'),
      supabase.from('inspector_locations').select('inspector_id,location_id'),
    ])
    setInspectors((insp ?? []) as Profile[])
    setLocations((locs ?? []) as Location[])
    const map: Record<string, string[]> = {}
    for (const row of (il ?? [])) {
      if (!map[row.inspector_id]) map[row.inspector_id] = []
      map[row.inspector_id].push(row.location_id)
    }
    setAssignedLocs(map)
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
    const { error } = await supabase.from('profiles').update({
      full_name: fd.get('full_name') as string,
      start_date: (fd.get('start_date') as string) || null,
      vacation_days_remaining: Number(fd.get('vacation_days') || 0),
    }).eq('id', editInsp.id)
    if (error) toast('שגיאה בעדכון', 'error')
    else { toast('עודכן', 'success'); setEditInsp(null); loadAll() }
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
    const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(path)
    await supabase.from('profiles').update({ contract_url: publicUrl }).eq('id', inspId)
    setInspectors(prev => prev.map(i => i.id === inspId ? { ...i, contract_url: publicUrl } : i))
    toast('חוזה הועלה', 'success')
  }

  async function toggleLocAssign(inspId: string, locId: string) {
    const current = assignedLocs[inspId] ?? []
    if (current.includes(locId)) {
      await supabase.from('inspector_locations').delete()
        .eq('inspector_id', inspId).eq('location_id', locId)
      setAssignedLocs(prev => ({ ...prev, [inspId]: prev[inspId].filter(l => l !== locId) }))
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
                <tr><th>שם</th><th>תאריך התחלה</th><th>ימי חופש</th><th>מקומות</th><th>חוזה</th><th></th></tr>
              </thead>
              <tbody>
                {inspectors.map(insp => (
                  <tr key={insp.id}>
                    <td><strong>{insp.full_name}</strong></td>
                    <td>{insp.start_date ? formatDate(insp.start_date) : <span className="mutedCell">-</span>}</td>
                    <td>{insp.vacation_days_remaining}</td>
                    <td>
                      <span className="badge badge--info">
                        {(assignedLocs[insp.id] ?? []).length} מקומות
                      </span>
                    </td>
                    <td>
                      {insp.contract_url
                        ? <a href={insp.contract_url} target="_blank" rel="noreferrer"
                            className="button button--ghost button--sm">
                            <ExternalLink size={13} /> צפה
                          </a>
                        : <span className="mutedCell">אין</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="button button--icon button--ghost" title="פרטים"
                          onClick={() => setDetailInsp(insp)}><Eye size={15} /></button>
                        <button className="button button--icon button--ghost" title="עריכה"
                          onClick={() => setEditInsp(insp)}><Pen size={15} /></button>
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
        <form id="insp-add-form" onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field"><span>שם מלא *</span><input name="full_name" required /></label>
          <label className="field"><span>אימייל *</span><input name="email" type="email" required /></label>
          <label className="field"><span>סיסמה זמנית *</span><input name="password" type="password" required minLength={6} /></label>
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
            <div className="fieldRow">
              <label className="field"><span>תאריך התחלה</span><input name="start_date" type="date" defaultValue={editInsp.start_date ?? ''} /></label>
              <label className="field"><span>ימי חופש</span><input name="vacation_days" type="number" min={0} defaultValue={editInsp.vacation_days_remaining} /></label>
            </div>
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
            </div>

            {/* Contract upload */}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>חוזה עבודה</div>
              {detailInsp.contract_url && (
                <div className="filePreview" style={{ marginBottom: 10 }}>
                  <span>חוזה קיים</span>
                  <a href={detailInsp.contract_url} target="_blank" rel="noreferrer"
                    className="button button--ghost button--sm">
                    <ExternalLink size={13} /> פתח
                  </a>
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
