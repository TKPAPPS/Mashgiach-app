'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, KeyRound } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { Profile } from '@/lib/supabase/types'

type Props = {
  refreshKey: number
  emailMap: Record<string, string | null>
  currentUserId: string | null
}

export default function AdminsTab({ refreshKey, emailMap, currentUserId }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [admins, setAdmins] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editAdmin, setEditAdmin] = useState<Profile | null>(null)
  const [resetAdmin, setResetAdmin] = useState<Profile | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('role', 'admin').order('full_name')
    setAdmins((data ?? []) as Profile[])
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fd.get('email'),
        password: fd.get('password'),
        full_name: fd.get('full_name'),
        role: 'admin',
      }),
    })
    const json = await res.json()
    if (!res.ok) toast(json.error ?? 'שגיאה ביצירת מנהל', 'error')
    else { toast('המנהל נוסף בהצלחה', 'success'); setAddOpen(false); loadAll() }
    setSaving(false)
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editAdmin) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error } = await supabase.from('profiles').update({
      full_name: fd.get('full_name') as string,
    }).eq('id', editAdmin.id)
    if (error) toast('שגיאה בעדכון', 'error')
    else { toast('עודכן', 'success'); setEditAdmin(null); loadAll() }
    setSaving(false)
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!resetAdmin) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const email = (fd.get('email') as string).trim()
    const password = (fd.get('password') as string).trim()
    if (!email && !password) { toast('יש להזין אימייל או סיסמה', 'error'); setSaving(false); return }
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resetAdmin.id, email: email || undefined, password: password || undefined }),
    })
    const json = await res.json()
    if (!res.ok) toast(json.error ?? 'שגיאה בעדכון', 'error')
    else { toast('עודכן בהצלחה', 'success'); setResetAdmin(null) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    const res = await fetch(`/api/admin/users?id=${deleteId}`, { method: 'DELETE' })
    if (!res.ok) toast('שגיאה במחיקה', 'error')
    else { toast('המנהל נמחק', 'success'); loadAll() }
    setDeleteId(null)
  }

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">מנהלים</div>
        <button className="button button--primary button--sm" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> הוסף מנהל
        </button>
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> :
        admins.length === 0 ? <div className="emptyState">אין מנהלים.</div> :
        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>שם</th><th>אימייל</th><th></th></tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin.id}>
                  <td>
                    <strong>{admin.full_name}</strong>
                    {admin.id === currentUserId && (
                      <span className="badge badge--primary" style={{ marginRight: 8, fontSize: '.7rem' }}>אתה</span>
                    )}
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    {emailMap[admin.id] ?? <span className="mutedCell">-</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="button button--icon button--ghost" title="עריכת שם"
                        onClick={() => setEditAdmin(admin)}><Pen size={15} /></button>
                      <button className="button button--icon button--ghost" title="אימייל / סיסמה"
                        onClick={() => setResetAdmin(admin)}><KeyRound size={15} /></button>
                      <button className="button button--icon button--ghost" title="מחיקה"
                        style={{ color: 'var(--danger)' }}
                        disabled={admin.id === currentUserId || admins.length <= 1}
                        onClick={() => setDeleteId(admin.id)}>
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

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="הוספת מנהל"
        footer={<>
          <button className="button button--ghost" onClick={() => setAddOpen(false)}>ביטול</button>
          <button className="button button--primary" type="submit" form="admin-add-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'צור מנהל'}
          </button>
        </>}>
        <form id="admin-add-form" onSubmit={handleCreate} autoComplete="off"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field"><span>שם מלא *</span><input name="full_name" required autoComplete="off" /></label>
          <label className="field"><span>אימייל *</span><input name="email" type="email" required autoComplete="off" /></label>
          <label className="field"><span>סיסמה *</span><input name="password" type="password" required minLength={6} autoComplete="new-password" /></label>
        </form>
      </Modal>

      <Modal open={!!editAdmin} onClose={() => setEditAdmin(null)} title="עריכת מנהל"
        footer={<>
          <button className="button button--ghost" onClick={() => setEditAdmin(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="admin-edit-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור'}
          </button>
        </>}>
        {editAdmin && (
          <form id="admin-edit-form" onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field"><span>שם מלא</span><input name="full_name" required defaultValue={editAdmin.full_name} /></label>
          </form>
        )}
      </Modal>

      <Modal open={!!resetAdmin} onClose={() => setResetAdmin(null)} title={`פרטי כניסה: ${resetAdmin?.full_name ?? ''}`}
        footer={<>
          <button className="button button--ghost" onClick={() => setResetAdmin(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="admin-reset-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'עדכן'}
          </button>
        </>}>
        {resetAdmin && (
          <form id="admin-reset-form" onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: '.875rem', color: 'var(--muted)' }}>השאר שדה ריק כדי לא לשנות אותו.</p>
            <label className="field"><span>אימייל חדש</span>
              <input name="email" type="email" placeholder="השאר ריק לאי-שינוי" autoComplete="off" /></label>
            <label className="field"><span>סיסמה חדשה</span>
              <input name="password" type="password" placeholder="השאר ריק לאי-שינוי" minLength={6} autoComplete="new-password" /></label>
          </form>
        )}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת מנהל"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteId(null)}>ביטול</button>
          <button className="button button--danger" onClick={handleDelete}>מחק</button>
        </>}>
        <p>האם אתה בטוח שברצונך למחוק מנהל זה? הפעולה אינה הפיכה.</p>
      </Modal>
    </div>
  )
}
