'use client'
import { useState, useEffect, useMemo, FormEvent } from 'react'
import { Upload, Download, Trash2, FileText, Image as ImageIcon, MapPin, User } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/utils/format'
import type { SharedInspector, SharedLocation } from './AdminShell'

type DocRow = {
  id: string
  name: string
  file_name: string
  file_type: 'image' | 'document'
  location_id: string | null
  inspector_id: string | null
  created_at: string
  url: string | null
}

type Props = {
  refreshKey: number
  locations: SharedLocation[]
  inspectors: SharedInspector[]
}

export default function DocumentsTab({ refreshKey, locations, inspectors }: Props) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { load() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/documents')
    setDocs(res.ok ? await res.json() : [])
    setLoading(false)
  }

  // O(1) id -> name lookups instead of scanning the arrays per row.
  const locMap = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations])
  const inspMap = useMemo(() => new Map(inspectors.map(i => [i.id, i.full_name])), [inspectors])
  const locName = (id: string | null) => (id ? locMap.get(id) : undefined)
  const inspName = (id: string | null) => (id ? inspMap.get(id) : undefined)

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    if (!(fd.get('file') as File)?.size) { toast('יש לבחור קובץ', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/admin/documents', { method: 'POST', body: fd })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast(j.error || 'שגיאה בהעלאה', 'error')
      return
    }
    toast('המסמך נשמר', 'success')
    setUploadOpen(false)
    load()
  }

  async function handleDelete() {
    if (!deleteId) return
    const res = await fetch(`/api/admin/documents?id=${deleteId}`, { method: 'DELETE' })
    if (!res.ok) { toast('שגיאה במחיקה', 'error') }
    else { toast('המסמך נמחק', 'success'); setDocs(prev => prev.filter(d => d.id !== deleteId)) }
    setDeleteId(null)
  }

  return (
    <div>
      <div className="card">
        <div className="card__header--inline">
          <div className="card__title">מסמכים וחוזים</div>
          <button className="button button--primary button--sm" onClick={() => setUploadOpen(true)}>
            <Upload size={15} /> העלאת מסמך
          </button>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {loading ? <div className="emptyState"><span className="spinner" /></div> :
          docs.length === 0 ? <div className="emptyState">אין מסמכים.</div> :
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>שם</th><th>שיוך</th><th>תאריך</th><th></th></tr>
              </thead>
              <tbody>
                {docs.map(d => {
                  const linkLoc = locName(d.location_id)
                  const linkInsp = inspName(d.inspector_id)
                  return (
                    <tr key={d.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {d.file_type === 'image' ? <ImageIcon size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} /> : <FileText size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                          {d.name}
                        </div>
                      </td>
                      <td>
                        {linkLoc
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} />{linkLoc}</span>
                          : linkInsp
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={12} />{linkInsp}</span>
                            : <span className="mutedCell">-</span>}
                      </td>
                      <td className="noWrap textMuted textSm">{formatDateTime(d.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {d.url && (
                            <a className="button button--icon button--ghost" title="הורד / הצג" href={d.url} target="_blank" rel="noreferrer"><Download size={15} /></a>
                          )}
                          <button className="button button--icon button--ghost" title="מחיקה"
                            style={{ color: 'var(--danger)' }} onClick={() => setDeleteId(d.id)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>}
        </div>
      </div>

      {/* Upload modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="העלאת מסמך"
        footer={<>
          <button className="button button--ghost" onClick={() => setUploadOpen(false)}>ביטול</button>
          <button className="button button--primary" type="submit" form="doc-upload-form" disabled={saving}>
            {saving ? <span className="spinner" /> : 'שמור'}
          </button>
        </>}>
        {uploadOpen && (
          <form id="doc-upload-form" onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field"><span>שם המסמך</span>
              <input name="name" placeholder="לדוגמה: חוזה כשרות 2026" />
            </label>
            <label className="field"><span>קובץ *</span>
              <input name="file" type="file" required
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/gif,image/webp" />
            </label>
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>שייך לעיר/מקום או למשגיח (אופציונלי)</p>
            <div className="fieldRow">
              <label className="field"><span>מקום</span>
                <select name="location_id" defaultValue="">
                  <option value="">ללא</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className="field"><span>משגיח</span>
                <select name="inspector_id" defaultValue="">
                  <option value="">ללא</option>
                  {inspectors.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
                </select>
              </label>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת מסמך"
        footer={<>
          <button className="button button--ghost" onClick={() => setDeleteId(null)}>ביטול</button>
          <button className="button button--danger" onClick={handleDelete}>מחק</button>
        </>}>
        <p>האם אתה בטוח שברצונך למחוק מסמך זה? הפעולה אינה הפיכה.</p>
      </Modal>
    </div>
  )
}
