'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { ChecklistItem } from '@/lib/supabase/types'

type Props = { refreshKey: number }

export default function ChecklistAdmin({ refreshKey }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadItems() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('checklist_items').select('*').order('sort_order')
    setItems((data ?? []) as ChecklistItem[])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const name = fd.get('name') as string
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0)
    const { error } = await supabase.from('checklist_items').insert({ name, sort_order: maxOrder + 1, active: true })
    if (error) toast('שגיאה', 'error')
    else { toast('נוסף', 'success'); setAddOpen(false); loadItems() }
    setSaving(false)
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editItem) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error } = await supabase.from('checklist_items').update({ name: fd.get('name') as string }).eq('id', editItem.id)
    if (error) toast('שגיאה', 'error')
    else { toast('עודכן', 'success'); setEditItem(null); loadItems() }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    await supabase.from('checklist_items').delete().eq('id', deleteId)
    toast('נמחק', 'success')
    setDeleteId(null)
    loadItems()
  }

  async function toggleActive(item: ChecklistItem) {
    await supabase.from('checklist_items').update({ active: !item.active }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i))
  }

  async function moveItem(item: ChecklistItem, direction: 'up' | 'down') {
    const idx = items.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    const other = items[swapIdx]
    await Promise.all([
      supabase.from('checklist_items').update({ sort_order: other.sort_order }).eq('id', item.id),
      supabase.from('checklist_items').update({ sort_order: item.sort_order }).eq('id', other.id),
    ])
    loadItems()
  }

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">רשימת בדיקות</div>
        <button className="button button--primary button--sm" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> הוסף פריט
        </button>
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> :
        items.length === 0 ? <div className="emptyState">אין פריטים.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px' }}>
          {items.map((item, idx) => (
            <div key={item.id} className={`checklistAdminItem${item.active ? '' : ' checklistAdminItem--inactive'}`}>
              <input type="checkbox" checked={item.active} readOnly onChange={() => toggleActive(item)}
                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                onClick={() => toggleActive(item)} />
              <span className="checklistAdminItem__name">{item.name}</span>
              {!item.active && <span className="badge badge--muted">מושבת</span>}
              <div style={{ display: 'flex', gap: 2, marginRight: 'auto' }}>
                <button className="button button--icon button--ghost" disabled={idx === 0}
                  onClick={() => moveItem(item, 'up')} title="הזז למעלה"><ArrowUp size={13} /></button>
                <button className="button button--icon button--ghost" disabled={idx === items.length - 1}
                  onClick={() => moveItem(item, 'down')} title="הזז למטה"><ArrowDown size={13} /></button>
                <button className="button button--icon button--ghost" onClick={() => setEditItem(item)}
                  title="עריכה"><Pen size={13} /></button>
                <button className="button button--icon button--ghost" style={{ color: 'var(--danger)' }}
                  onClick={() => setDeleteId(item.id)} title="מחיקה"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="הוספת פריט"
        footer={<>
          <button className="button button--ghost" onClick={() => setAddOpen(false)}>ביטול</button>
          <button className="button button--primary" type="submit" form="cl-add-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'הוסף'}
          </button>
        </>}>
        <form id="cl-add-form" onSubmit={handleAdd}>
          <label className="field"><span>שם הבדיקה *</span><input name="name" required autoFocus /></label>
        </form>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="עריכת פריט"
        footer={<>
          <button className="button button--ghost" onClick={() => setEditItem(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="cl-edit-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור'}
          </button>
        </>}>
        {editItem && (
          <form id="cl-edit-form" onSubmit={handleEdit}>
            <label className="field"><span>שם הבדיקה</span><input name="name" required defaultValue={editItem.name} /></label>
          </form>
        )}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת פריט"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteId(null)}>ביטול</button>
          <button className="button button--danger" onClick={handleDelete}>מחק</button>
        </>}>
        <p>האם אתה בטוח שברצונך למחוק פריט זה?</p>
      </Modal>
    </div>
  )
}
