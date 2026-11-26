'use client'
import { useState } from 'react'
import { MapPin, Pen, Trash2, Check, X, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

type CityRow = { id: string; name_he: string; name_en: string | null; locations: number }

type Props = {
  onChanged: () => void
}

// Manager for the closed city list (table `cities`). Locations pick a city from
// this list; renaming here renames it on every location (DB trigger). Deleting a
// city that has locations moves them to another city first. Mounted on the
// Dashboard tab.
export default function CitiesManager({ onChanged }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [cities, setCities] = useState<CityRow[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editHe, setEditHe] = useState('')
  const [editEn, setEditEn] = useState('')
  const [newHe, setNewHe] = useState('')
  const [newEn, setNewEn] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CityRow | null>(null)
  const [mergeInto, setMergeInto] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/cities')
    setCities(res.ok ? await res.json() : [])
  }

  function openManager() { setOpen(true); setCities(null); load() }

  async function call(method: 'POST' | 'PATCH' | 'DELETE', bodyOrQuery: Record<string, string>) {
    setBusy(true)
    const res = method === 'DELETE'
      ? await fetch(`/api/admin/cities?${new URLSearchParams(bodyOrQuery)}`, { method })
      : await fetch('/api/admin/cities', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOrQuery) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error ?? 'שגיאה', 'error'); return false }
    await load()
    onChanged()
    return true
  }

  async function add() {
    if (!newHe.trim()) return
    if (await call('POST', { name_he: newHe, name_en: newEn })) { toast('העיר נוספה', 'success'); setNewHe(''); setNewEn('') }
  }

  async function saveEdit(id: string) {
    if (await call('PATCH', { id, name_he: editHe, name_en: editEn })) { toast('העיר עודכנה בכל המקומות', 'success'); setEditing(null) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const q: Record<string, string> = { id: deleteTarget.id }
    if (deleteTarget.locations > 0) q.merge_into = mergeInto
    if (await call('DELETE', q)) { toast('העיר נמחקה', 'success'); setDeleteTarget(null); setMergeInto('') }
  }

  const input = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px', fontSize: '.85rem', minWidth: 0 } as const

  return (
    <>
      <button className="button button--ghost button--sm" onClick={openManager}>
        <MapPin size={14} /> ניהול ערים
      </button>

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null) }} title="ניהול ערים">
        <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '0 0 10px' }}>
          רשימת הערים הסגורה. כל מקום משויך לעיר מהרשימה. שינוי שם מתעדכן בכל המקומות בעיר.
        </p>
        {cities === null ? <div className="emptyState"><span className="spinner" /></div> : (
          <div className="tableWrap" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>עברית</th><th>אנגלית</th><th>מקומות</th><th></th></tr></thead>
              <tbody>
                {cities.map(c => (
                  <tr key={c.id}>
                    {editing === c.id ? (
                      <>
                        <td><input value={editHe} onChange={e => setEditHe(e.target.value)} autoFocus aria-label="שם בעברית" style={{ ...input, width: 120 }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditing(null) }} /></td>
                        <td><input value={editEn} onChange={e => setEditEn(e.target.value)} dir="ltr" aria-label="שם באנגלית" style={{ ...input, width: 120 }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditing(null) }} /></td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 600 }}>{c.name_he}</td>
                        <td dir="ltr" style={{ textAlign: 'end', color: 'var(--muted)' }}>{c.name_en ?? '-'}</td>
                      </>
                    )}
                    <td>{c.locations}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {editing === c.id ? (
                          <>
                            <button className="button button--icon button--ghost" title="שמור" aria-label="שמור" disabled={busy} onClick={() => saveEdit(c.id)}><Check size={15} /></button>
                            <button className="button button--icon button--ghost" title="ביטול" aria-label="ביטול" onClick={() => setEditing(null)}><X size={15} /></button>
                          </>
                        ) : (
                          <>
                            <button className="button button--icon button--ghost" title="שנה שם" aria-label={`שנה שם ${c.name_he}`}
                              onClick={() => { setEditing(c.id); setEditHe(c.name_he); setEditEn(c.name_en ?? '') }}><Pen size={15} /></button>
                            <button className="button button--icon button--ghost" title="מחק" aria-label={`מחק ${c.name_he}`} style={{ color: 'var(--danger)' }}
                              onClick={() => { setDeleteTarget(c); setMergeInto('') }}><Trash2 size={15} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); add() }} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input value={newHe} onChange={e => setNewHe(e.target.value)} placeholder="עיר חדשה (עברית)" aria-label="עיר חדשה בעברית" style={{ ...input, flex: '1 1 120px' }} />
          <input value={newEn} onChange={e => setNewEn(e.target.value)} placeholder="English (optional)" dir="ltr" aria-label="עיר חדשה באנגלית" style={{ ...input, flex: '1 1 120px' }} />
          <button className="button button--primary button--sm" type="submit" disabled={busy || !newHe.trim()}><Plus size={14} /> הוסף</button>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="מחיקת עיר"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteTarget(null)}>ביטול</button>
          <button className="button button--danger" disabled={busy || (!!deleteTarget?.locations && !mergeInto)} onClick={confirmDelete}>
            {deleteTarget?.locations ? 'העבר ומחק' : 'מחק'}
          </button>
        </>}>
        {deleteTarget && (deleteTarget.locations === 0
          ? <p>למחוק את העיר &quot;{deleteTarget.name_he}&quot;? אין בה מקומות.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0 }}>בעיר &quot;{deleteTarget.name_he}&quot; יש {deleteTarget.locations} מקומות. לאיזו עיר להעביר אותם לפני המחיקה?</p>
              <select value={mergeInto} onChange={e => setMergeInto(e.target.value)} aria-label="עיר יעד">
                <option value="">בחר עיר</option>
                {(cities ?? []).filter(c => c.id !== deleteTarget.id).map(c => <option key={c.id} value={c.id}>{c.name_he}</option>)}
              </select>
            </div>
          ))}
      </Modal>
    </>
  )
}
