'use client'
import { useState, useEffect, useRef, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pen, Trash2, QrCode, MapPin, Eye, ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { genQrCode } from '@/lib/utils/format'
import type { Location } from '@/lib/supabase/types'
import LocationDetailModal from './LocationDetailModal'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'

// Extracted to module level so React never remounts it on parent re-render
function LocationForm({
  loc,
  formId,
  onSubmit,
}: {
  loc?: Location
  formId: string
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  const [qr, setQr] = useState(() => loc?.qr_code ?? genQrCode())
  return (
    <form id={formId} onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="status" value={loc?.status ?? 'active'} />

      {/* Basic info */}
      <div className="fieldRow">
        <label className="field"><span>שם המקום *</span><input name="name" required defaultValue={loc?.name} /></label>
        <label className="field"><span>עיר</span><input name="city" defaultValue={loc?.city ?? ''} /></label>
      </div>
      <label className="field"><span>כתובת</span><input name="address" defaultValue={loc?.address ?? ''} /></label>

      {/* QR code */}
      <label className="field">
        <span>קוד QR *</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="qr_code" required value={qr} onChange={e => setQr(e.target.value)}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: '.875rem', direction: 'ltr', fontFamily: 'monospace' }} />
          <button type="button" className="button button--ghost button--sm" onClick={() => setQr(genQrCode())}>חדש</button>
        </div>
      </label>

      {/* GPS */}
      <div className="fieldRow">
        <label className="field"><span>קו רוחב (Latitude)</span><input name="lat" type="number" step="any" defaultValue={loc?.lat ?? ''} placeholder="13.7563" /></label>
        <label className="field"><span>קו אורך (Longitude)</span><input name="lng" type="number" step="any" defaultValue={loc?.lng ?? ''} placeholder="100.5018" /></label>
      </div>

      {/* Status (edit only) */}
      {loc && (
        <label className="field"><span>סטטוס</span>
          <select name="status" defaultValue={loc.status}>
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
        </label>
      )}

      {/* Contact info */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: 0 }}>פרטי קשר (אופציונלי)</p>
      <div className="fieldRow">
        <label className="field"><span>איש קשר</span><input name="contact_name" defaultValue={loc?.contact_name ?? ''} /></label>
        <label className="field"><span>טלפון</span><input name="contact_phone" defaultValue={loc?.contact_phone ?? ''} /></label>
      </div>
      <label className="field"><span>אימייל</span><input name="contact_email" type="email" defaultValue={loc?.contact_email ?? ''} /></label>
      <label className="field"><span>הערות קשר</span><textarea name="contact_notes" rows={2} defaultValue={loc?.contact_notes ?? ''} /></label>

      {/* Kashrus procedure */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: 0 }}>נוהל כשרות (אופציונלי)</p>
      <label className="field"><span>נוהל כשרות</span><textarea name="kashrus_procedure" rows={4} defaultValue={loc?.kashrus_procedure ?? ''} /></label>
    </form>
  )
}

type Props = { refreshKey: number }

export default function LocationsTab({ refreshKey }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editLoc, setEditLoc] = useState<Location | null>(null)
  const [detailLoc, setDetailLoc] = useState<Location | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [qrLoc, setQrLoc] = useState<Location | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const [saving, setSaving] = useState(false)
  const [sortKey, setSortKey] = useState<'name' | 'city' | 'address' | 'qr_code' | 'gps' | 'status'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [citySearch, setCitySearch] = useState('')
  const [groupByCity, setGroupByCity] = useState(true)

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={11} style={{ opacity: .3, flexShrink: 0 }} />
    return sortDir === 'asc' ? <ArrowUp size={11} style={{ flexShrink: 0 }} /> : <ArrowDown size={11} style={{ flexShrink: 0 }} />
  }

  const sorted = [...locations].sort((a, b) => {
    let va: string, vb: string
    switch (sortKey) {
      case 'name':    va = a.name ?? '';    vb = b.name ?? '';    break
      case 'city':    va = a.city ?? '';    vb = b.city ?? '';    break
      case 'address': va = a.address ?? ''; vb = b.address ?? ''; break
      case 'qr_code': va = a.qr_code ?? ''; vb = b.qr_code ?? ''; break
      case 'gps':     va = a.lat != null ? '1' : '0'; vb = b.lat != null ? '1' : '0'; break
      case 'status':  va = a.status ?? ''; vb = b.status ?? ''; break
    }
    const cmp = va.localeCompare(vb, 'he')
    return sortDir === 'asc' ? cmp : -cmp
  })

  const filtered = sorted.filter(l =>
    !citySearch.trim() || (l.city ?? '').toLowerCase().includes(citySearch.trim().toLowerCase())
  )

  // Group filtered locations by city. Null/blank city sorts last under "ללא עיר".
  const cityGroups: { key: string; label: string; items: Location[] }[] = (() => {
    if (!groupByCity) return [{ key: '', label: '', items: filtered }]
    const map = new Map<string, Location[]>()
    for (const l of filtered) {
      const key = l.city?.trim() || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b, 'he')
    })
    return keys.map(k => ({ key: k, label: k || 'ללא עיר', items: map.get(k)! }))
  })()

  useEffect(() => { load() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('locations')
      .select('id,name,city,address,qr_code,lat,lng,status').order('name')
    setLocations((data ?? []) as Location[])
    setLoading(false)
  }

  async function openForEdit(loc: Location) {
    const { data } = await supabase.from('locations').select('*').eq('id', loc.id).single()
    setEditLoc((data ?? loc) as Location)
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const basePayload = {
      name:               fd.get('name') as string,
      city:               (fd.get('city') as string) || null,
      address:            (fd.get('address') as string) || null,
      qr_code:            fd.get('qr_code') as string,
      lat:                fd.get('lat') ? Number(fd.get('lat')) : null,
      lng:                fd.get('lng') ? Number(fd.get('lng')) : null,
      status:             (fd.get('status') as 'active' | 'inactive') ?? 'active',
      contact_name:       (fd.get('contact_name') as string) || null,
      contact_phone:      (fd.get('contact_phone') as string) || null,
      contact_email:      (fd.get('contact_email') as string) || null,
      contact_notes:      (fd.get('contact_notes') as string) || null,
      kashrus_procedure:  (fd.get('kashrus_procedure') as string) || null,
    }

    if (editLoc) {
      const { error } = await supabase.from('locations').update(basePayload).eq('id', editLoc.id)
      if (error) { toast('שגיאה בשמירה', 'error'); setSaving(false); return }
      toast('המקום עודכן בהצלחה', 'success')
      setEditLoc(null)
    } else {
      const { data: created, error } = await supabase.from('locations').insert({
        ...basePayload,
        kashrus_procedure_file_url: null,
        kashrus_certificate_url: null,
      }).select().single()
      if (error) { toast('שגיאה ביצירה. בדוק שקוד QR ייחודי', 'error'); setSaving(false); return }
      toast('המקום נוסף בהצלחה', 'success')
      setAddOpen(false)
      if (created) setDetailLoc(created as Location)
    }
    setSaving(false)
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
    await supabase.from('locations').update({ status: loc.status === 'active' ? 'inactive' : 'active' }).eq('id', loc.id)
    load()
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
        {locations.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '0 14px 10px' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
              <Search size={14} style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} aria-hidden />
              <input
                value={citySearch}
                onChange={e => setCitySearch(e.target.value)}
                placeholder="חיפוש לפי עיר..."
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 10px 7px 30px', fontSize: '.85rem' }}
              />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={groupByCity} onChange={e => setGroupByCity(e.target.checked)} />
              קבץ לפי עיר
            </label>
          </div>
        )}
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          locations.length === 0 ? <div className="emptyState">אין מקומות.</div> :
          filtered.length === 0 ? <div className="emptyState">לא נמצאו מקומות לעיר זו.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {([
                    ['name',    'שם המקום'],
                    ['city',    'עיר'],
                    ['address', 'כתובת'],
                    ['qr_code', 'קוד QR'],
                    ['gps',     'GPS'],
                    ['status',  'סטטוס'],
                  ] as [typeof sortKey, string][]).map(([col, label]) => (
                    <th key={col} onClick={() => handleSort(col)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {label}<SortIcon col={col} />
                      </span>
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              {cityGroups.map(group => (
                <tbody key={group.key || '__all__'}>
                  {groupByCity && (
                    <tr>
                      <th colSpan={7} style={{ textAlign: 'start', background: 'var(--bg-muted, #f5f5f5)', fontSize: '.8rem', fontWeight: 700, padding: '6px 12px' }}>
                        {group.label} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({group.items.length})</span>
                      </th>
                    </tr>
                  )}
                  {group.items.map(loc => (
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
                        {loc.lat && loc.lng
                          ? <span className="badge badge--success" style={{ fontSize: '.7rem' }}>✓</span>
                          : <span className="badge badge--muted" style={{ fontSize: '.7rem' }}>לא מוגדר</span>}
                      </td>
                      <td>
                        <button className={`badge ${loc.status === 'active' ? 'badge--success' : 'badge--muted'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                          onClick={() => toggleStatus(loc)}>
                          {loc.status === 'active' ? 'פעיל' : 'לא פעיל'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="button button--icon button--ghost" title="פרטים מלאים" onClick={() => setDetailLoc(loc)}><Eye size={15} /></button>
                          <button className="button button--icon button--ghost" title="הצג QR" onClick={() => setQrLoc(loc)}><QrCode size={15} /></button>
                          <button className="button button--icon button--ghost" title="עריכה" onClick={() => openForEdit(loc)}><Pen size={15} /></button>
                          <button className="button button--icon button--ghost" title="מחיקה"
                            style={{ color: 'var(--danger)' }} onClick={() => setDeleteId(loc.id)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>}
        </div>
      </div>

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="הוספת מקום"
        footer={<>
          <button className="button button--ghost" onClick={() => setAddOpen(false)}>ביטול</button>
          <button className="button button--primary" type="submit" form="loc-add-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור מקום'}
          </button>
        </>}>
        {addOpen && <LocationForm formId="loc-add-form" onSubmit={handleSave} />}
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editLoc} onClose={() => setEditLoc(null)} title="עריכת מקום"
        footer={<>
          <button className="button button--ghost" onClick={() => setEditLoc(null)}>ביטול</button>
          <button className="button button--primary" type="submit" form="loc-edit-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור שינויים'}
          </button>
        </>}>
        {editLoc && <LocationForm formId="loc-edit-form" loc={editLoc} onSubmit={handleSave} />}
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
      <Modal open={!!qrLoc} onClose={() => setQrLoc(null)} title={`קוד QR: ${qrLoc?.name ?? ''}`}>
        {qrLoc && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: '.875rem', marginBottom: 16 }}>
              הדפס ותלה במקום, או הצג למשגיח לסריקה
            </p>
            <div style={{ display: 'inline-block', padding: 16, background: '#fff',
              border: '2px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <QRCodeSVG value={qrLoc.qr_code} size={220} level="M" />
            </div>
            {/* Hidden canvas used only for PNG download */}
            <div style={{ position: 'absolute', left: -9999, top: -9999 }}>
              <QRCodeCanvas ref={qrCanvasRef} value={qrLoc.qr_code} size={600} level="M" />
            </div>
            <div style={{ marginTop: 12 }}>
              <code style={{ fontSize: '.85rem', fontFamily: 'monospace', color: 'var(--muted)' }}>
                {qrLoc.qr_code}
              </code>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                className="button button--primary button--sm"
                onClick={() => {
                  const canvas = qrCanvasRef.current
                  if (!canvas) return
                  const url = canvas.toDataURL('image/png')
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `qr-${qrLoc.qr_code}.png`
                  a.click()
                }}
              >
                הורד QR (PNG)
              </button>
            </div>
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
