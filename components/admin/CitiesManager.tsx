'use client'
import { useState } from 'react'
import { MapPin, Pen, Trash2, Check, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { SharedLocation } from './AdminShell'

type Props = {
  locations: SharedLocation[]
  onChanged: () => void
}

// Lightweight manager for the free-text city values on locations. Rename updates
// every location using that city; delete detaches it (sets city=null). Mounted on
// the Dashboard tab.
export default function CitiesManager({ locations, onChanged }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ city: string; count: number } | null>(null)
  const [busy, setBusy] = useState(false)

  // Distinct cities with their location counts, sorted Hebrew-aware.
  const cities = (() => {
    const counts = new Map<string, number>()
    for (const l of locations) {
      const c = l.city?.trim()
      if (!c) continue
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => a.city.localeCompare(b.city, 'he'))
  })()

  function startEdit(city: string) {
    setEditing(city)
    setEditValue(city)
  }

  async function saveRename(from: string) {
    const to = editValue.trim()
    if (!to || to === from) { setEditing(null); return }
    setBusy(true)
    const res = await fetch('/api/admin/cities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    setBusy(false)
    if (!res.ok) { toast('שגיאה בעדכון העיר', 'error'); return }
    toast('העיר עודכנה', 'success')
    setEditing(null)
    onChanged()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    const res = await fetch(`/api/admin/cities?city=${encodeURIComponent(deleteTarget.city)}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { toast('שגיאה במחיקת העיר', 'error'); return }
    toast('העיר נמחקה מהמקומות', 'success')
    setDeleteTarget(null)
    onChanged()
  }

  return (
    <>
      <button className="button button--ghost button--sm" onClick={() => setOpen(true)}>
        <MapPin size={14} /> ניהול ערים
      </button>

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null) }} title="ניהול ערים">
        {cities.length === 0
          ? <div className="emptyState">אין ערים מוגדרות.</div>
          : <div className="tableWrap" style={{ margin: 0 }}>
              <table>
                <thead><tr><th>עיר</th><th>מקומות</th><th></th></tr></thead>
                <tbody>
                  {cities.map(({ city, count }) => (
                    <tr key={city}>
                      <td>
                        {editing === city
                          ? <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveRename(city); if (e.key === 'Escape') setEditing(null) }}
                              style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: '.85rem', width: 140 }}
                            />
                          : city}
                      </td>
                      <td>{count}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {editing === city ? (
                            <>
                              <button className="button button--icon button--ghost" title="שמור" disabled={busy} onClick={() => saveRename(city)}><Check size={15} /></button>
                              <button className="button button--icon button--ghost" title="ביטול" onClick={() => setEditing(null)}><X size={15} /></button>
                            </>
                          ) : (
                            <>
                              <button className="button button--icon button--ghost" title="שנה שם" onClick={() => startEdit(city)}><Pen size={15} /></button>
                              <button className="button button--icon button--ghost" title="מחק" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget({ city, count })}><Trash2 size={15} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="מחיקת עיר"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteTarget(null)}>ביטול</button>
          <button className="button button--danger" disabled={busy} onClick={confirmDelete}>מחק</button>
        </>}>
        <p>
          מחיקת העיר &quot;{deleteTarget?.city}&quot; תסיר אותה מ{deleteTarget?.count} מקומות (השדה עיר יתרוקן). המקומות עצמם לא יימחקו. להמשיך?
        </p>
      </Modal>
    </>
  )
}
