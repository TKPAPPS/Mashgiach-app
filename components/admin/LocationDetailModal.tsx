'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/utils/format'
import type { Location, VisitLog, DeficiencyReport, VisitCheck, Profile, ChecklistItem } from '@/lib/supabase/types'
import { Upload, Trash2, ExternalLink } from 'lucide-react'

type InnerTab = 'info' | 'kashrus' | 'certificate' | 'procedure' | 'inspectors' | 'deficiencies' | 'checks' | 'visits'
type ProcPhoto = { id: string; note: string | null; url: string | null }

export default function LocationDetailModal({ loc, onClose }: { loc: Location; onClose: () => void }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [tab, setTab] = useState<InnerTab>('info')
  const [location, setLocation] = useState<Location>(loc)
  const [visits, setVisits] = useState<VisitLog[]>([])
  const [deficiencies, setDeficiencies] = useState<DeficiencyReport[]>([])
  const [checks, setChecks] = useState<VisitCheck[]>([])
  const [assignedInspectors, setAssignedInspectors] = useState<Profile[]>([])
  const [allInspectors, setAllInspectors] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [editingDefNotes, setEditingDefNotes] = useState<Record<string, string>>({})
  const [savingDefNotes, setSavingDefNotes] = useState<Record<string, boolean>>({})
  // Procedure tab state (loaded lazily when the tab opens)
  const [procLoaded, setProcLoaded] = useState(false)
  const [procPhotos, setProcPhotos] = useState<ProcPhoto[]>([])
  const [procItems, setProcItems] = useState<ChecklistItem[]>([])
  const [procNoteEdits, setProcNoteEdits] = useState<Record<string, string>>({})
  const [newPhotoNote, setNewPhotoNote] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'procedure' && !procLoaded) loadProcedure() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProcedure() {
    const res = await fetch(`/api/admin/procedure-photos?location_id=${loc.id}`)
    setProcPhotos(res.ok ? await res.json() : [])
    // The location's own checklist items (fallback to global), to attach per-check notes.
    const { data: own } = await supabase.from('checklist_items').select('*').eq('location_id', loc.id).order('sort_order')
    let items = (own ?? []) as ChecklistItem[]
    if (items.length === 0) {
      const { data: globals } = await supabase.from('checklist_items').select('*').is('location_id', null).order('sort_order')
      items = (globals ?? []) as ChecklistItem[]
    }
    setProcItems(items)
    setProcLoaded(true)
  }

  async function saveProcedureFields(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error, data } = await supabase.from('locations').update({
      opening_hours: (fd.get('opening_hours') as string) || null,
      inspector_arrival_time: (fd.get('inspector_arrival_time') as string) || null,
    }).eq('id', loc.id).select().single()
    if (error) toast('שגיאה בשמירה', 'error')
    else { toast('הנוהל נשמר', 'success'); setLocation(data as Location) }
    setSaving(false)
  }

  async function uploadProcedurePhoto(file: File) {
    setUploadingPhoto(true)
    const form = new FormData()
    form.append('location_id', loc.id)
    form.append('file', file)
    if (newPhotoNote.trim()) form.append('note', newPhotoNote.trim())
    const res = await fetch('/api/admin/procedure-photos', { method: 'POST', body: form })
    if (res.ok) { const created = await res.json(); setProcPhotos(prev => [...prev, created]); setNewPhotoNote('') }
    else toast('שגיאה בהעלאת התמונה', 'error')
    setUploadingPhoto(false)
  }

  async function deleteProcedurePhoto(id: string) {
    const res = await fetch(`/api/admin/procedure-photos?id=${id}`, { method: 'DELETE' })
    if (res.ok) setProcPhotos(prev => prev.filter(p => p.id !== id))
    else toast('שגיאה במחיקה', 'error')
  }

  async function saveProcPhotoNote(id: string) {
    const note = procNoteEdits[`photo-${id}`] ?? ''
    const res = await fetch('/api/admin/procedure-photos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, note }),
    })
    if (res.ok) {
      setProcPhotos(prev => prev.map(p => p.id === id ? { ...p, note: note || null } : p))
      setProcNoteEdits(prev => { const n = { ...prev }; delete n[`photo-${id}`]; return n })
      toast('ההערה נשמרה', 'success')
    } else toast('שגיאה', 'error')
  }

  async function saveCheckProcNote(id: string) {
    const note = procNoteEdits[`check-${id}`] ?? ''
    const { error } = await supabase.from('checklist_items').update({ procedure_note: note || null }).eq('id', id)
    if (error) { toast('שגיאה', 'error'); return }
    setProcItems(prev => prev.map(i => i.id === id ? { ...i, procedure_note: note || null } : i))
    setProcNoteEdits(prev => { const n = { ...prev }; delete n[`check-${id}`]; return n })
    toast('ההערה נשמרה', 'success')
  }

  async function loadAll() {
    const [{ data: fullLoc }, { data: v }, { data: d }, { data: c }, { data: ai }, { data: all }] = await Promise.all([
      supabase.from('locations').select('*').eq('id', loc.id).single(),
      supabase.from('visit_logs').select('*, inspector:profiles(id,full_name)').eq('location_id', loc.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('deficiency_reports').select('*, inspector:profiles(id,full_name)').eq('location_id', loc.id).order('created_at', { ascending: false }),
      supabase.from('visit_checks').select('*, inspector:profiles(id,full_name)').eq('location_id', loc.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('inspector_locations').select('inspector:profiles(*)').eq('location_id', loc.id),
      supabase.from('profiles').select('*').eq('role', 'mashgiach').order('full_name'),
    ])
    if (fullLoc) setLocation(fullLoc as Location)
    setVisits((v ?? []) as VisitLog[])
    setDeficiencies((d ?? []) as DeficiencyReport[])
    setChecks((c ?? []) as VisitCheck[])
    const inspList = (ai ?? []).map((r: { inspector: unknown }) => r.inspector as Profile)
    setAssignedInspectors(inspList)
    setAllInspectors((all ?? []) as Profile[])
  }

  async function saveInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error, data } = await supabase.from('locations').update({
      contact_name:  fd.get('contact_name') as string,
      contact_phone: fd.get('contact_phone') as string,
      contact_email: fd.get('contact_email') as string,
      contact_notes: fd.get('contact_notes') as string,
    }).eq('id', loc.id).select().single()
    if (error) toast('שגיאה בשמירה', 'error')
    else { toast('נשמר', 'success'); setLocation(data as Location) }
    setSaving(false)
  }

  async function saveKashrus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error, data } = await supabase.from('locations').update({
      kashrus_procedure: fd.get('kashrus_procedure') as string,
    }).eq('id', loc.id).select().single()
    if (error) toast('שגיאה', 'error')
    else { toast('נוהל כשרות נשמר', 'success'); setLocation(data as Location) }
    setSaving(false)
  }

  async function uploadCertificate(file: File) {
    const path = `certificates/${loc.id}/${file.name}`
    const { error: upErr } = await supabase.storage.from('certificates').upload(path, file, { upsert: true })
    if (upErr) { toast('שגיאה בהעלאה', 'error'); return }
    const { data: { publicUrl } } = supabase.storage.from('certificates').getPublicUrl(path)
    await supabase.from('locations').update({ kashrus_certificate_url: publicUrl }).eq('id', loc.id)
    setLocation(l => ({ ...l, kashrus_certificate_url: publicUrl }))
    toast('תעודה הועלתה', 'success')
  }

  async function deleteCertificate() {
    await supabase.from('locations').update({ kashrus_certificate_url: null }).eq('id', loc.id)
    setLocation(l => ({ ...l, kashrus_certificate_url: null }))
    toast('תעודה נמחקה', 'success')
  }

  async function toggleAssign(inspector: Profile) {
    const isAssigned = assignedInspectors.some(i => i.id === inspector.id)
    if (isAssigned) {
      await supabase.from('inspector_locations').delete()
        .eq('inspector_id', inspector.id).eq('location_id', loc.id)
      setAssignedInspectors(prev => prev.filter(i => i.id !== inspector.id))
    } else {
      await supabase.from('inspector_locations').insert({ inspector_id: inspector.id, location_id: loc.id })
      setAssignedInspectors(prev => [...prev, inspector])
    }
  }

  async function updateDeficiencyStatus(id: string, status: string) {
    await supabase.from('deficiency_reports').update({ admin_status: status as 'open' | 'in_progress' | 'resolved' }).eq('id', id)
    setDeficiencies(prev => prev.map(d => d.id === id ? { ...d, admin_status: status as DeficiencyReport['admin_status'] } : d))
  }

  async function saveDefNotes(id: string) {
    const value = editingDefNotes[id] ?? ''
    setSavingDefNotes(prev => ({ ...prev, [id]: true }))
    await supabase.from('deficiency_reports').update({ admin_notes: value }).eq('id', id)
    setDeficiencies(prev => prev.map(d => d.id === id ? { ...d, admin_notes: value } : d))
    setEditingDefNotes(prev => { const n = { ...prev }; delete n[id]; return n })
    setSavingDefNotes(prev => ({ ...prev, [id]: false }))
  }

  const INNER_TABS: { id: InnerTab; label: string }[] = [
    { id: 'info',         label: 'פרטי קשר' },
    { id: 'kashrus',      label: 'נוהל כשרות' },
    { id: 'procedure',    label: 'נוהל עבודה' },
    { id: 'certificate',  label: 'תעודת כשרות' },
    { id: 'inspectors',   label: 'משגיחים' },
    { id: 'deficiencies', label: 'ליקויים' },
    { id: 'checks',       label: 'בדיקות' },
    { id: 'visits',       label: 'כניסות/יציאות' },
  ]

  return (
    <Modal open onClose={onClose} title={`${loc.name}${loc.city ? `, ${loc.city}` : ''}`} size="xl">
      <div className="innerTabs">
        {INNER_TABS.map(t => (
          <button key={t.id} className={`innerTab${tab === t.id ? ' innerTab--active' : ''}`}
            onClick={() => setTab(t.id)} type="button">{t.label}</button>
        ))}
      </div>

      {/* Contact info */}
      {tab === 'info' && (
        <form key={location.updated_at ?? 'loading'} onSubmit={saveInfo} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="fieldRow">
            <label className="field"><span>איש קשר</span><input name="contact_name" defaultValue={location.contact_name ?? ''} /></label>
            <label className="field"><span>טלפון</span><input name="contact_phone" defaultValue={location.contact_phone ?? ''} /></label>
          </div>
          <label className="field"><span>אימייל</span><input name="contact_email" type="email" defaultValue={location.contact_email ?? ''} /></label>
          <label className="field"><span>הערות קשר</span><textarea name="contact_notes" defaultValue={location.contact_notes ?? ''} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="button button--primary" type="submit" disabled={saving}>שמור</button>
          </div>
        </form>
      )}

      {/* Kashrus procedure */}
      {tab === 'kashrus' && (
        <form key={location.updated_at ?? 'loading'} onSubmit={saveKashrus} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            <span>נוהל כשרות (טקסט חופשי)</span>
            <textarea name="kashrus_procedure" rows={10} defaultValue={location.kashrus_procedure ?? ''} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="button button--primary" type="submit" disabled={saving}>שמור נוהל</button>
          </div>
        </form>
      )}

      {/* Work & kashrut procedure */}
      {tab === 'procedure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <form key={`proc-${location.updated_at ?? 'loading'}`} onSubmit={saveProcedureFields} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fieldRow">
              <label className="field"><span>שעות פתיחה</span><input name="opening_hours" defaultValue={location.opening_hours ?? ''} placeholder="08:00-22:00" /></label>
              <label className="field"><span>שעת הגעת משגיח נדרשת</span><input name="inspector_arrival_time" defaultValue={location.inspector_arrival_time ?? ''} placeholder="08:30" /></label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="button button--primary" type="submit" disabled={saving}>שמור</button>
            </div>
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>הטקסט הכללי של הנוהל נערך בלשונית &quot;נוהל כשרות&quot;.</p>
          </form>

          {/* Appliance / oven photos with a note each */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 8 }}>תמונות תנורים ומכשירי חשמל</div>
            {procPhotos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 12 }}>
                {procPhotos.map(p => (
                  <div key={p.id} className="card" style={{ margin: 0, padding: 8 }}>
                    {p.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
                    )}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                      <input
                        value={procNoteEdits[`photo-${p.id}`] ?? (p.note ?? '')}
                        onChange={e => setProcNoteEdits(prev => ({ ...prev, [`photo-${p.id}`]: e.target.value }))}
                        placeholder="הערה לתמונה..."
                        style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: '.8rem' }} />
                      {procNoteEdits[`photo-${p.id}`] !== undefined && procNoteEdits[`photo-${p.id}`] !== (p.note ?? '') && (
                        <button className="button button--primary button--sm" style={{ padding: '4px 8px', fontSize: '.72rem' }} onClick={() => saveProcPhotoNote(p.id)}>שמור</button>
                      )}
                      <button className="button button--icon button--ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteProcedurePhoto(p.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={newPhotoNote} onChange={e => setNewPhotoNote(e.target.value)} placeholder="הערה (אופציונלי) לתמונה הבאה"
                style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 10px', fontSize: '.82rem' }} />
              <label className="button button--ghost button--sm" style={{ cursor: 'pointer', gap: 6 }}>
                {uploadingPhoto ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Upload size={14} />} העלה תמונה
                <input type="file" accept="image/*" disabled={uploadingPhoto} style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadProcedurePhoto(f); e.target.value = '' }} />
              </label>
            </div>
          </div>

          {/* Per-check procedure notes */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 8 }}>הערות נוהל לבדיקות הכשרות</div>
            {procItems.length === 0 ? <p className="textSm textMuted">אין פריטי בדיקה למקום זה.</p> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {procItems.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ flex: '0 0 40%', fontSize: '.84rem' }}>
                    {item.name} <span className="badge badge--muted" style={{ fontSize: '.66rem' }}>{item.frequency === 'weekly' ? 'שבועי' : 'יומי'}</span>
                  </span>
                  <input
                    value={procNoteEdits[`check-${item.id}`] ?? (item.procedure_note ?? '')}
                    onChange={e => setProcNoteEdits(prev => ({ ...prev, [`check-${item.id}`]: e.target.value }))}
                    placeholder="הערת נוהל..."
                    style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: '.8rem' }} />
                  {procNoteEdits[`check-${item.id}`] !== undefined && procNoteEdits[`check-${item.id}`] !== (item.procedure_note ?? '') && (
                    <button className="button button--primary button--sm" style={{ padding: '4px 8px', fontSize: '.72rem' }} onClick={() => saveCheckProcNote(item.id)}>שמור</button>
                  )}
                </div>
              ))}
            </div>}
          </div>
        </div>
      )}

      {/* Certificate */}
      {tab === 'certificate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {location.kashrus_certificate_url ? (
            <div>
              <div className="filePreview">
                <span>תעודת כשרות קיימת</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={location.kashrus_certificate_url} target="_blank" rel="noreferrer"
                    className="button button--ghost button--sm">
                    <ExternalLink size={14} /> צפה
                  </a>
                  <button className="button button--ghost button--sm" style={{ color: 'var(--danger)' }}
                    onClick={deleteCertificate}><Trash2 size={14} /> מחק</button>
                </div>
              </div>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 8 }}>להחלפה, העלה קובץ חדש:</p>
            </div>
          ) : null}
          <label className="fileUpload">
            <div className="fileUpload__area">
              <Upload size={20} style={{ margin: '0 auto 6px' }} />
              <div>לחץ להעלאת תעודת כשרות</div>
              <div style={{ fontSize: '.78rem' }}>תמונה או PDF</div>
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) uploadCertificate(e.target.files[0]) }} />
            </div>
          </label>
        </div>
      )}

      {/* Inspectors assignment */}
      {tab === 'inspectors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="textSm textMuted">לחץ על שם משגיח לשיוך/הסרה</p>
          {allInspectors.map(insp => {
            const assigned = assignedInspectors.some(i => i.id === insp.id)
            return (
              <div key={insp.id}
                className={`checklistAdminItem${assigned ? '' : ' checklistAdminItem--inactive'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => toggleAssign(insp)}>
                <input type="checkbox" readOnly checked={assigned} style={{ accentColor: 'var(--primary)' }} />
                <span className="checklistAdminItem__name">{insp.full_name}</span>
                {assigned && <span className="badge badge--success">משויך</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Deficiencies */}
      {tab === 'deficiencies' && (
        <div className="tableWrap">
          {deficiencies.length === 0 ? <div className="emptyState">אין ליקויים.</div> :
          <table>
            <thead><tr><th>תאריך</th><th>משגיח</th><th>סוג</th><th>פירוט</th><th>סטטוס</th><th>הערות מנהל</th></tr></thead>
            <tbody>
              {deficiencies.map(d => {
                const noteValue = d.id in editingDefNotes ? editingDefNotes[d.id] : (d.admin_notes ?? '')
                const isDirty = d.id in editingDefNotes && editingDefNotes[d.id] !== (d.admin_notes ?? '')
                return (
                  <tr key={d.id}>
                    <td className="noWrap">{formatDateTime(d.created_at)}</td>
                    <td>{(d.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                    <td>{d.report_type === 'deficiency' ? 'ליקוי' : 'הערה'}</td>
                    <td>{d.description}</td>
                    <td>
                      <select value={d.admin_status}
                        onChange={e => updateDeficiencyStatus(d.id, e.target.value)}
                        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 6px', fontSize: '.8rem' }}>
                        <option value="open">פתוח</option>
                        <option value="in_progress">בטיפול</option>
                        <option value="resolved">טופל</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          value={noteValue}
                          placeholder="הוסף הערה..."
                          onChange={e => setEditingDefNotes(prev => ({ ...prev, [d.id]: e.target.value }))}
                          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '3px 8px', fontSize: '.82rem', width: 120 }}
                        />
                        {isDirty && (
                          <button
                            className="button button--primary button--sm"
                            onClick={() => saveDefNotes(d.id)}
                            disabled={savingDefNotes[d.id]}>
                            {savingDefNotes[d.id] ? <span className="spinner" style={{ width: 10, height: 10 }} /> : 'שמור'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>}
        </div>
      )}

      {/* Checks */}
      {tab === 'checks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {checks.length === 0 ? <div className="emptyState">אין בדיקות.</div> :
          (() => {
            const grouped: Record<string, VisitCheck[]> = {}
            const order: string[] = []
            for (const c of checks) {
              const key = c.visit_log_id ?? 'unknown'
              if (!grouped[key]) { grouped[key] = []; order.push(key) }
              grouped[key].push(c)
            }
            return order.map(key => {
              const group = grouped[key]
              const first = group[0]
              const insp = (first.inspector as { full_name: string } | undefined)?.full_name ?? '-'
              return (
                <div key={key} className="card" style={{ margin: 0 }}>
                  <div className="card__header" style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                      {formatDateTime(first.created_at)} | {insp}
                    </div>
                  </div>
                  <div className="tableWrap" style={{ margin: 0 }}>
                    <table>
                      <thead><tr><th>בדיקה</th><th>הערה</th></tr></thead>
                      <tbody>
                        {group.map(c => (
                          <tr key={c.id}>
                            <td>{c.item_name ?? '-'}</td>
                            <td>{c.note ?? <span className="mutedCell">-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Visits */}
      {tab === 'visits' && (
        <div className="tableWrap">
          {visits.length === 0 ? <div className="emptyState">אין כניסות/יציאות.</div> :
          <table>
            <thead><tr><th>תאריך</th><th>פעולה</th><th>משגיח</th><th>סטטוס</th><th>GPS</th></tr></thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id}>
                  <td className="noWrap">{formatDateTime(v.created_at)}</td>
                  <td>{v.action_type === 'entry' ? 'כניסה' : 'יציאה'}</td>
                  <td>{(v.inspector as { full_name: string } | undefined)?.full_name ?? '-'}</td>
                  <td><span className={`badge ${v.internal_status === 'success' ? 'badge--success' : 'badge--warning'}`}>
                    {v.internal_status === 'success' ? 'הצלחה' : v.internal_status}
                  </span></td>
                  <td>
                    {v.device_lat && v.device_lng
                      ? <a className="coordsLink" href={`https://maps.google.com/?q=${v.device_lat},${v.device_lng}`} target="_blank" rel="noreferrer">
                          {v.device_lat.toFixed(4)}, {v.device_lng.toFixed(4)}
                        </a>
                      : <span className="mutedCell">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      )}
    </Modal>
  )
}
