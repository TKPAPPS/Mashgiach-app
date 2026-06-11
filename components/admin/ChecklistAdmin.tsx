'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, ArrowUp, ArrowDown, Copy } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { ChecklistItem, ChecklistFrequency } from '@/lib/supabase/types'
import type { SharedLocation } from './AdminShell'

type Props = { refreshKey: number; locations: SharedLocation[] }

const FREQ_LABEL: Record<ChecklistFrequency, string> = { daily: 'יומי', weekly: 'שבועי' }

export default function ChecklistAdmin({ refreshKey, locations }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [selectedLoc, setSelectedLoc] = useState('') // '' = global default list
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)

  useEffect(() => { loadItems() }, [refreshKey, selectedLoc]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadItems() {
    setLoading(true)
    let q = supabase.from('checklist_items').select('*').order('sort_order')
    q = selectedLoc ? q.eq('location_id', selectedLoc) : q.is('location_id', null)
    const { data } = await q
    setItems((data ?? []) as ChecklistItem[])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const name = fd.get('name') as string
    const frequency = (fd.get('frequency') as ChecklistFrequency) || 'daily'
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0)
    const { error } = await supabase.from('checklist_items').insert({
      name, sort_order: maxOrder + 1, active: true,
      location_id: selectedLoc || null, frequency,
    })
    if (error) toast('שגיאה', 'error')
    else { toast('נוסף', 'success'); setAddOpen(false); loadItems() }
    setSaving(false)
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editItem) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error } = await supabase.from('checklist_items')
      .update({ name: fd.get('name') as string, frequency: (fd.get('frequency') as ChecklistFrequency) || 'daily' })
      .eq('id', editItem.id)
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

  // Reorder within the same frequency group (the rendered list per group).
  async function moveItem(group: ChecklistItem[], item: ChecklistItem, direction: 'up' | 'down') {
    const idx = group.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= group.length) return
    const other = group[swapIdx]
    await Promise.all([
      supabase.from('checklist_items').update({ sort_order: other.sort_order }).eq('id', item.id),
      supabase.from('checklist_items').update({ sort_order: item.sort_order }).eq('id', other.id),
    ])
    loadItems()
  }

  // Seed the selected location with the current global default list (as daily
  // items). Opt-in, so no automatic bulk data change happens at deploy time.
  async function copyDefaults() {
    if (!selectedLoc) return
    setCopying(true)
    const { data: globals } = await supabase.from('checklist_items')
      .select('name,sort_order,frequency').is('location_id', null).eq('active', true).order('sort_order')
    if (!globals || globals.length === 0) { toast('אין רשימת ברירת מחדל להעתקה', 'error'); setCopying(false); return }
    const rows = globals.map(g => ({
      name: g.name, sort_order: g.sort_order, active: true,
      location_id: selectedLoc, frequency: (g.frequency as ChecklistFrequency) ?? 'daily',
    }))
    const { error } = await supabase.from('checklist_items').insert(rows)
    if (error) toast('שגיאה בהעתקה', 'error')
    else { toast('הרשימה הועתקה', 'success'); loadItems() }
    setCopying(false)
  }

  const groups: { freq: ChecklistFrequency; list: ChecklistItem[] }[] = [
    { freq: 'daily', list: items.filter(i => i.frequency === 'daily') },
    { freq: 'weekly', list: items.filter(i => i.frequency === 'weekly') },
  ]

  return (
    <div className="card">
      <div className="card__header--inline">
        <div className="card__title">רשימת בדיקות</div>
        <button className="button button--primary button--sm" onClick={() => setAddOpen(true)}>
          <Plus size={15} /> הוסף פריט
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '0 14px 10px' }}>
        <label className="field" style={{ minWidth: 220 }}>
          <span>רשימה עבור</span>
          <select value={selectedLoc} onChange={e => setSelectedLoc(e.target.value)}>
            <option value="">רשימת ברירת מחדל (כללית)</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        {/* Only offer seeding when the location has no items, so the defaults can
            never be copied twice and create duplicates. */}
        {selectedLoc && !loading && items.length === 0 && (
          <button className="button button--ghost button--sm" disabled={copying} onClick={copyDefaults}>
            <Copy size={14} /> העתק רשימת ברירת מחדל
          </button>
        )}
      </div>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0, padding: '0 14px 10px' }}>
        {selectedLoc
          ? 'אם למקום אין פריטים משלו, המשגיח יראה את רשימת ברירת המחדל הכללית.'
          : 'רשימה כללית שחלה על כל המקומות שאין להם רשימה משלהם.'}
      </p>

      <div style={{ padding: '0 0 4px' }}>
        {loading ? <div className="emptyState"><span className="spinner" /></div> :
        items.length === 0 ? <div className="emptyState">אין פריטים.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 12px' }}>
          {groups.map(({ freq, list }) => list.length === 0 ? null : (
            <div key={freq}>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                {FREQ_LABEL[freq]} ({list.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((item, idx) => (
                  <div key={item.id} className={`checklistAdminItem${item.active ? '' : ' checklistAdminItem--inactive'}`}>
                    <input type="checkbox" checked={item.active} readOnly
                      style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                      onClick={() => toggleActive(item)} />
                    <span className="checklistAdminItem__name">{item.name}</span>
                    {!item.active && <span className="badge badge--muted">מושבת</span>}
                    <div style={{ display: 'flex', gap: 2, marginRight: 'auto' }}>
                      <button className="button button--icon button--ghost" disabled={idx === 0}
                        onClick={() => moveItem(list, item, 'up')} title="הזז למעלה"><ArrowUp size={13} /></button>
                      <button className="button button--icon button--ghost" disabled={idx === list.length - 1}
                        onClick={() => moveItem(list, item, 'down')} title="הזז למטה"><ArrowDown size={13} /></button>
                      <button className="button button--icon button--ghost" onClick={() => setEditItem(item)}
                        title="עריכה"><Pen size={13} /></button>
                      <button className="button button--icon button--ghost" style={{ color: 'var(--danger)' }}
                        onClick={() => setDeleteId(item.id)} title="מחיקה"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
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
        <form id="cl-add-form" onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field"><span>שם הבדיקה *</span><input name="name" required autoFocus /></label>
          <label className="field"><span>תדירות</span>
            <select name="frequency" defaultValue="daily">
              <option value="daily">יומי</option>
              <option value="weekly">שבועי</option>
            </select>
          </label>
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
          <form id="cl-edit-form" onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field"><span>שם הבדיקה</span><input name="name" required defaultValue={editItem.name} /></label>
            <label className="field"><span>תדירות</span>
              <select name="frequency" defaultValue={editItem.frequency}>
                <option value="daily">יומי</option>
                <option value="weekly">שבועי</option>
              </select>
            </label>
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
