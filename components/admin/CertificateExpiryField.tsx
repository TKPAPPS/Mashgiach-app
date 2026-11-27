'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { certStatus, certBadgeClass } from '@/lib/utils/certExpiry'

// "בתוקף עד" on the certificate tab. Saving a new date resets the alert stage
// (DB trigger locations_reset_cert_alert), so the 30/7/0-day alerts start over.
export default function CertificateExpiryField({ locationId, value, onSaved }: {
  locationId: string
  value: string | null | undefined
  onSaved: (date: string | null) => void
}) {
  const { toast } = useToast()
  const [date, setDate] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = (date || null) !== (value ?? null)
  const status = certStatus(value)

  async function save() {
    setSaving(true)
    const next = date || null
    const { error } = await createClient().from('locations').update({ kashrus_certificate_expires_on: next }).eq('id', locationId)
    setSaving(false)
    if (error) { toast('שגיאה בשמירה', 'error'); return }
    onSaved(next)
    toast(next ? 'תאריך התפוגה נשמר' : 'תאריך התפוגה נמחק', 'success')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }} data-testid="cert-expiry">
      <label className="field" style={{ flex: '0 1 200px' }}>
        <span>בתוקף עד</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="תאריך תפוגת התעודה" />
      </label>
      {dirty && (
        <button type="button" className="button button--primary button--sm" disabled={saving} onClick={save} style={{ marginBottom: 2 }}>
          {saving ? <span className="spinner" /> : 'שמור תאריך'}
        </button>
      )}
      {!dirty && status && <span className={`badge ${certBadgeClass(status.kind)}`} style={{ marginBottom: 8 }} data-testid="cert-status">{status.text}</span>}
      {!dirty && !status && <span style={{ fontSize: '.8rem', color: 'var(--warning)', marginBottom: 8 }}>הזן תאריך כדי לקבל התראה לפני שהתעודה פוקעת.</span>}
    </div>
  )
}
