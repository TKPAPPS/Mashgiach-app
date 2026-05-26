'use client'
import { useState, useEffect, useRef } from 'react'
import {
  Plus, X, Pencil, Trash2, Check, Paperclip,
  FileText, Image as ImageIcon, Download,
} from 'lucide-react'
import type { SharedLocation } from './AdminShell'

type LocationReport = {
  id: string
  location_id: string
  admin_id: string
  title: string
  body: string | null
  visit_date: string
  created_at: string
  updated_at: string
  location: { id: string; name: string; city: string | null; address: string | null } | null
  admin: { id: string; full_name: string } | null
}

type Attachment = {
  id: string
  file_name: string
  file_type: 'image' | 'document'
  created_at: string
  url: string | null
}

type Followup = {
  id: string
  text: string
  is_done: boolean
  created_at: string
  admin: { id: string; full_name: string } | null
}

type Props = {
  refreshKey: number
  locations: SharedLocation[]
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
      <button style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
        <X size={28} />
      </button>
    </div>
  )
}

function ReportForm({
  locations,
  initial,
  onSave,
  onClose,
}: {
  locations: SharedLocation[]
  initial?: Partial<LocationReport>
  onSave: () => void
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [locationId, setLocationId] = useState(initial?.location_id ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [visitDate, setVisitDate] = useState(initial?.visit_date ?? today)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId || !title.trim()) { setErr('יש למלא מקום וכותרת'); return }
    setSaving(true)
    setErr('')
    const isEdit = !!initial?.id
    const res = await fetch('/api/admin/location-reports', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit
        ? { id: initial!.id, title: title.trim(), body: body.trim() || null, visit_date: visitDate }
        : { location_id: locationId, title: title.trim(), body: body.trim() || null, visit_date: visitDate }),
    })
    setSaving(false)
    if (!res.ok) {
      const body2 = await res.json().catch(() => ({}))
      setErr(body2?.error ?? 'שגיאה בשמירה')
      return
    }
    onSave()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
        margin: '0 16px', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '1.05rem' }}>{initial?.id ? 'עריכת דוח' : 'דוח מנהל חדש'}</strong>
          <button className="button button--icon button--ghost" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!initial?.id && (
            <label className="field">
              <span>מקום *</span>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} required>
                <option value="">בחר מקום</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` (${l.city})` : ''}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>תאריך ביקור</span>
            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
          </label>
          <label className="field">
            <span>כותרת *</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="נושא הדוח" required />
          </label>
          <label className="field">
            <span>תוכן</span>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              rows={5} placeholder="פרטי הדוח, הערות, תצפיות..." style={{ resize: 'vertical' }} />
          </label>
          {err && <p style={{ color: 'var(--danger)', margin: 0, fontSize: '.85rem' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="button button--ghost button--sm" onClick={onClose}>ביטול</button>
            <button type="submit" className="button button--primary button--sm" disabled={saving}>
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AttachmentsPanel({ reportId }: { reportId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAttachments() }, [reportId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAttachments() {
    setLoading(true)
    const res = await fetch(`/api/admin/location-report-attachments?report_id=${reportId}`)
    if (res.ok) setAttachments(await res.json())
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('report_id', reportId)
    form.append('file', file)
    const res = await fetch('/api/admin/location-report-attachments', { method: 'POST', body: form })
    if (res.ok) {
      const att = await res.json()
      setAttachments(prev => [...prev, att])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק קובץ זה?')) return
    await fetch(`/api/admin/location-report-attachments?id=${id}`, { method: 'DELETE' })
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: '.9rem' }}>קבצים מצורפים ({attachments.length})</strong>
        <div>
          <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            style={{ display: 'none' }} onChange={handleUpload} />
          <button className="button button--ghost button--sm" onClick={() => fileRef.current?.click()}
            disabled={uploading}>
            <Paperclip size={13} /> {uploading ? 'מעלה...' : 'הוסף קובץ'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><span className="spinner" /></div>
      ) : attachments.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', textAlign: 'center', padding: '12px 0' }}>אין קבצים מצורפים.</p>
      ) : (
        <div>
          {/* Image grid */}
          {attachments.filter(a => a.file_type === 'image').length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 8 }}>
              {attachments.filter(a => a.file_type === 'image').map(a => (
                <div key={a.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: 'var(--border)' }}>
                  <div style={{ cursor: 'pointer', width: '100%', height: '100%' }}
                    onClick={() => a.url && setLightbox(a.url)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.url && <img src={a.url} alt={a.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {!a.url && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><ImageIcon size={20} /></div>}
                  </div>
                  <button onClick={() => handleDelete(a.id)}
                    style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '1px 4px', lineHeight: 1 }}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Document list */}
          {attachments.filter(a => a.file_type === 'document').map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <FileText size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</span>
              <span style={{ fontSize: '.75rem', color: 'var(--muted)', flexShrink: 0 }}>{formatDate(a.created_at)}</span>
              {a.url && (
                <a href={a.url} download={a.file_name} target="_blank" rel="noreferrer"
                  className="button button--icon button--ghost" style={{ padding: '2px 4px' }} title="הורד">
                  <Download size={13} />
                </a>
              )}
              <button className="button button--icon button--ghost" style={{ padding: '2px 4px', color: 'var(--danger)' }}
                onClick={() => handleDelete(a.id)} title="מחק">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

function FollowupsPanel({ reportId }: { reportId: string }) {
  const [followups, setFollowups] = useState<Followup[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => { loadFollowups() }, [reportId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFollowups() {
    setLoading(true)
    const res = await fetch(`/api/admin/location-report-followups?report_id=${reportId}`)
    if (res.ok) setFollowups(await res.json())
    setLoading(false)
  }

  async function addFollowup() {
    if (!newText.trim()) return
    setAdding(true)
    const res = await fetch('/api/admin/location-report-followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, text: newText.trim() }),
    })
    if (res.ok) {
      const newFollowup = await res.json()
      setFollowups(prev => [...prev, newFollowup])
      setNewText('')
    }
    setAdding(false)
  }

  async function toggleDone(f: Followup) {
    const res = await fetch('/api/admin/location-report-followups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, is_done: !f.is_done }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFollowups(prev => prev.map(x => x.id === updated.id ? updated : x))
    }
  }

  async function deleteFollowup(id: string) {
    await fetch(`/api/admin/location-report-followups?id=${id}`, { method: 'DELETE' })
    setFollowups(prev => prev.filter(f => f.id !== id))
  }

  const open = followups.filter(f => !f.is_done)
  const done = followups.filter(f => f.is_done)

  return (
    <div>
      <strong style={{ fontSize: '.9rem', display: 'block', marginBottom: 10 }}>המשך טיפול ({open.length} פתוחים)</strong>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {open.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#fafafa', border: '1px solid var(--border)' }}>
              <button onClick={() => toggleDone(f)}
                style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 4, border: '2px solid var(--primary)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              </button>
              <span style={{ flex: 1, fontSize: '.875rem' }}>{f.text}</span>
              <span style={{ fontSize: '.75rem', color: 'var(--muted)', flexShrink: 0 }}>{formatDate(f.created_at)}</span>
              <button className="button button--icon button--ghost" style={{ padding: '2px', color: 'var(--danger)', flexShrink: 0 }}
                onClick={() => deleteFollowup(f.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {done.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '4px 0' }}>הושלמו:</p>
              {done.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderRadius: 8, opacity: .6 }}>
                  <button onClick={() => toggleDone(f)}
                    style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 4, border: '2px solid var(--success)', background: 'var(--success)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Check size={11} color="#fff" />
                  </button>
                  <span style={{ flex: 1, fontSize: '.875rem', textDecoration: 'line-through' }}>{f.text}</span>
                  <button className="button button--icon button--ghost" style={{ padding: '2px', color: 'var(--danger)', flexShrink: 0 }}
                    onClick={() => deleteFollowup(f.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="הוסף פעולת המשך..."
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: '.875rem' }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFollowup() } }}
        />
        <button className="button button--primary button--sm" onClick={addFollowup} disabled={adding || !newText.trim()}>
          הוסף
        </button>
      </div>
    </div>
  )
}

function ReportDetailModal({ report, onClose, onEdit, onDelete }: {
  report: LocationReport
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [section, setSection] = useState<'attachments' | 'followups'>('attachments')
  const loc = report.location

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600,
        margin: '0 16px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1.05rem' }}>{report.title}</strong>
              <span style={{ fontSize: '.8rem', color: 'var(--muted)', background: '#f0f0f0', borderRadius: 4, padding: '1px 6px' }}>{formatDate(report.visit_date)}</span>
            </div>
            {loc && (
              <p style={{ margin: '4px 0 0', fontSize: '.85rem', color: 'var(--muted)' }}>
                {loc.name}{loc.city ? ` - ${loc.city}` : ''}{loc.address ? ` | ${loc.address}` : ''}
              </p>
            )}
            <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: 'var(--muted)' }}>
              {report.admin?.full_name ?? '-'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="button button--icon button--ghost" onClick={onEdit} title="ערוך"><Pencil size={16} /></button>
            <button className="button button--icon button--ghost" style={{ color: 'var(--danger)' }} onClick={onDelete} title="מחק"><Trash2 size={16} /></button>
            <button className="button button--icon button--ghost" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Body scrollable */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Report content */}
          {report.body && (
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ margin: 0, fontSize: '.9rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{report.body}</p>
            </div>
          )}

          {/* Section tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {(['attachments', 'followups'] as const).map(s => (
              <button key={s} onClick={() => setSection(s)}
                style={{
                  flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontSize: '.85rem', fontWeight: 500,
                  background: section === s ? 'var(--primary)' : 'transparent',
                  color: section === s ? '#fff' : 'var(--text)',
                }}>
                {s === 'attachments' ? 'קבצים מצורפים' : 'המשך טיפול'}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px 20px 20px' }}>
            {section === 'attachments' ? (
              <AttachmentsPanel reportId={report.id} />
            ) : (
              <FollowupsPanel reportId={report.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminReportTab({ refreshKey, locations }: Props) {
  const [reports, setReports] = useState<LocationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ city: '', location_id: '', from: '', to: '' })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LocationReport | null>(null)
  const [selected, setSelected] = useState<LocationReport | null>(null)

  useEffect(() => { loadReports() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReports() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (filters.location_id) params.set('location_id', filters.location_id)
    const res = await fetch(`/api/admin/location-reports?${params}`)
    if (res.ok) setReports(await res.json())
    setLoading(false)
  }

  function applyFilters() { loadReports() }

  const cities = Array.from(new Set(locations.map(l => l.city).filter(Boolean))) as string[]

  const filtered = reports.filter(r => {
    if (!r?.id) return false
    if (filters.city && r.location?.city !== filters.city) return false
    if (filters.location_id && r.location_id !== filters.location_id) return false
    return true
  })

  async function handleDelete(id: string) {
    if (!confirm('למחוק דוח זה?')) return
    await fetch(`/api/admin/location-reports?id=${id}`, { method: 'DELETE' })
    setReports(prev => prev.filter(r => r.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters + new button */}
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">דוחות מנהל</div>
          <button className="button button--primary button--sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> דוח חדש
          </button>
        </div>
        <div className="card__body">
          <div className="filtersGrid">
            <label className="field"><span>עיר</span>
              <select value={filters.city} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}>
                <option value="">הכל</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span>מקום</span>
              <select value={filters.location_id} onChange={e => setFilters(f => ({ ...f, location_id: e.target.value }))}>
                <option value="">הכל</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` (${l.city})` : ''}</option>)}
              </select>
            </label>
            <label className="field"><span>מתאריך</span>
              <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            </label>
            <label className="field"><span>עד תאריך</span>
              <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="button button--primary button--sm" onClick={applyFilters}>טען</button>
          </div>
        </div>
      </div>

      {/* Reports list */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">דוחות ({filtered.length})</div>
        </div>

        {loading ? (
          <div className="emptyState"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="emptyState">אין דוחות. לחץ על "דוח חדש" כדי להוסיף.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filtered.map(r => (
              <div key={r.id} style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setSelected(r)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '.9rem' }}>{r.title}</strong>
                    <span style={{ fontSize: '.75rem', background: '#f0f0f0', borderRadius: 4, padding: '1px 6px', color: 'var(--muted)' }}>{formatDate(r.visit_date)}</span>
                    {r.body && <span style={{ fontSize: '.78rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{r.body.slice(0, 60)}{r.body.length > 60 ? '...' : ''}</span>}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: 'var(--muted)' }}>
                    {r.location?.name ?? '-'}{r.location?.city ? ` | ${r.location.city}` : ''} &middot; {r.admin?.full_name ?? '-'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <button className="button button--ghost button--sm" style={{ fontSize: '.78rem' }}
                    onClick={() => setSelected(r)}>
                    <Paperclip size={13} /> קבצים ומעקב
                  </button>
                  <button className="button button--icon button--ghost" style={{ padding: '4px' }}
                    onClick={e => { e.stopPropagation(); setEditing(r) }} title="ערוך">
                    <Pencil size={14} />
                  </button>
                  <button className="button button--icon button--ghost" style={{ padding: '4px', color: 'var(--danger)' }}
                    onClick={e => { e.stopPropagation(); handleDelete(r.id) }} title="מחק">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit form */}
      {(showForm || editing) && (
        <ReportForm
          locations={locations}
          initial={editing ?? undefined}
          onSave={() => {
            setShowForm(false)
            setEditing(null)
            loadReports()
          }}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {/* Detail modal */}
      {selected && (
        <ReportDetailModal
          report={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null) }}
          onDelete={() => handleDelete(selected.id)}
        />
      )}
    </div>
  )
}
