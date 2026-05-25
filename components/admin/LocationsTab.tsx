'use client'
import { useState, useEffect, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, QrCode, MapPin, Eye } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { genQrCode } from '@/lib/utils/format'
import type { Location } from '@/lib/supabase/types'
import LocationDetailModal from './LocationDetailModal'

export default function LocationsTab() {
  const supabase = createClient()
  const { toast } = useToast()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editLoc, setEditLoc] = useState<Location | null>(null)
  const [detailLoc, setDetailLoc] = useState<Location | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [qrLoc, setQrLoc] = useState<Location | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('locations').select('*').order('name')
    setLocations(data ?? [])
    setLoading(false)
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const status = fd.get('status') as 'active' | 'inactive'
    const basePayload = {
      name:    fd.get('name') as string,
      city:    (fd.get('city') as string) || null,
      address: (fd.get('address') as string) || null,
      qr_code: fd.get('qr_code') as string,
      lat:     fd.get('lat') ? Number(fd.get('lat')) : null,
      lng:     fd.get('lng') ? Number(fd.get('lng')) : null,
      status,
    }

    if (editLoc) {
      const { error } = await supabase.from('locations').update(basePayload).eq('id', editLoc.id)
      if (error) { toast('שגיאה בשמירה', 'error'); setSaving(false); return }
      toast('המקום עודכן בהצלחה', 'success')
    } else {
      const { error } = await supabase.from('locations').insert({
        ...basePayload,
        contact_name: null, contact_phone: null, contact_email: null,
        contact_notes: null, kashrus_procedure: null,
        kashrus_procedure_file_url: null, kashrus_certificate_url: null,
      })
      if (error) { toast('שגיאה ביצירה — בדוק שקוד QR ייחודי', 'error'); setSaving(false); return }
      toast('המקום נוסף בהצלחה', 'success')
    }
    setSaving(false)
    setAddOpen(false)
    setEditLoc(null)
    load()
  }

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('locations').delete().eq('id', deleteId)
    if (error) { toast('שגיאה במחיקה', 'error') }
    else { toast('המקום נמחק', 'success'); load() }
    setDeleteId(null)
  }

  async function toggleStatus(loc: Location) {
    const newStatus = loc.status === 'active' ? 'inactive' : 'active'
    await supabase.from('locations').update({ status: newStatus }).eq('id', loc.id)
    load()
  }

  function LocationForm({ loc }: { loc?: Location }) {
    const [qr, setQr] = useState(loc?.qr_code ?? '')
    return (
      <form id="loc-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="status" value={loc?.status ?? 'active'} />
        <div className="fieldRow">
          <label className="field"><span>שם המקום *</span><input name="name" required defaultValue={loc?.name} /></label>
          <label className="field"><span>עיר</span><input name="city" defaultValue={loc?.city ?? ''} /></label>
        </div>
        <label className="field"><span>כתובת</span><input name="address" defaultValue={loc?.address ?? ''} /></label>
        <label className="field">
          <span>קוד QR *</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="qr_code" required value={qr} onChange={e => setQr(e.target.value)}
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 10px', fontSize: '.88rem', direction: 'ltr' }} />
            <button type="button" className="button button--ghost button--sm"
              onClick={() => setQr(genQrCode())}>חדש</button>
          </div>
        </label>
        <div className="fieldRow">
          <label className="field"><span>קו רוחב (אופציונלי)</span><input name="lat" type="number" step="any" defaultValue={loc?.lat ?? ''} /></label>
          <label className="field"><span>קו אורך (אופציונלי)</span><input name="lng" type="number" step="any" defaultValue={loc?.lng ?? ''} /></label>
        </div>
        {loc && (
          <label className="field"><span>סטטוס</span>
            <select name="status" defaultValue={loc.status}>
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
            </select>
          </label>
        )}
      </form>
    )
  }

  return (
    <div>
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">מקומות</div>
          <button className="button button--primary button--sm" onClick={() => setAddOpen(true)}>
            <Plus size={15} /> מקום חדש
          </button>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          locations.length === 0 ? <div className="emptyState">אין מקומות.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>שם המקום</th><th>עיר</th><th>כתובת</th><th>קוד QR</th><th>סטטוס</th><th></th></tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td>
                      <div className="adminSection__locName">
                        <MapPin size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} aria-hidden />
                        {loc.name}
                      </div>
                    </td>
                    <td>{loc.city ?? <span className="mutedCell">-</span>}</td>
                    <td>{loc.address ?? <span className="mutedCell">-</span>}</td>
                    <td><code className="qrCodeText">{loc.qr_code}</code></td>
                    <td>
                      <button className={`badge ${loc.status === 'active' ? 'badge--success' : 'badge--muted'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => toggleStatus(loc)}>
                        {loc.status === 'active' ? 'פעיל' : 'לא פעיל'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="button button--icon button--ghost" title="פרטים מלאים" onClick={() => setDetailLoc(loc)}>
                          <Eye size={15} />
                        </button>
                        <button className="button button--icon button--ghost" title="הצג QR" onClick={() => setQrLoc(loc)}>
                          <QrCode size={15} />
                        </button>
                        <button className="button button--icon button--ghost" title="עריכה" onClick={() => setEditLoc(loc)}>
                          <Pen size={15} />
                        </button>
                        <button className="button button--icon button--ghost" title="מחיקה"
                          style={{ color: 'var(--danger)' }} onClick={() => setDeleteId(loc.id)}>
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
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="הוספת מקום"
        footer={<>
          <button className="button button--ghost" onClick={() => setAddOpen(false)}>ביטול</button>
          <button className="button button--primary" type="submit" form="loc-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור'}
          </button>
        </>}>
        <LocationForm />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editLoc} onClose={() => setEditLoc(null)} title="עריכת מקום"
        footer={<>
          <button className="button button--ghost" onClick={() => setEditLoc(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="loc-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור שינויים'}
          </button>
        </>}>
        {editLoc && <LocationForm loc={editLoc} />}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת מקום"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteId(null)}>ביטול</button>
          <button className="button button--danger" onClick={handleDelete}>מחק</button>
        </>}>
        <p>האם אתה בטוח שברצונך למחוק מקום זה? הפעולה אינה הפיכה.</p>
      </Modal>

      {/* QR display */}
      <Modal open={!!qrLoc} onClose={() => setQrLoc(null)} title={`קוד QR — ${qrLoc?.name ?? ''}`}>
        {qrLoc && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 12 }}>
              הצג קוד זה למשגיח לסריקה
            </p>
            <code style={{ fontSize: '2rem', fontFamily: 'monospace', letterSpacing: '.1em',
              background: 'var(--bg)', padding: '16px 20px', borderRadius: 'var(--radius)', display: 'block' }}>
              {qrLoc.qr_code}
            </code>
          </div>
        )}
      </Modal>

      {/* Detail modal */}
      {detailLoc && (
        <LocationDetailModal loc={detailLoc} onClose={() => { setDetailLoc(null); load() }} />
      )}
    </div>
  )
}
