'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react'
import type { ChecklistItem } from '@/lib/supabase/types'

type Phase =
  | 'loading'
  | 'no-params'
  | 'form'
  | 'confirm-empty'
  | 'confirm-skip'
  | 'success'
  | 'error'

function ChecklistInner() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const visitLogId = params.get('visit_log_id')
  const locationId = params.get('location_id')

  const [phase, setPhase] = useState<Phase>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    if (!visitLogId || !locationId) { setPhase('no-params'); return }
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    setItems((data ?? []) as ChecklistItem[])
    setPhase('form')
  }, [visitLogId, locationId])

  useEffect(() => { load() }, [load])

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
      return next
    })
  }

  function setNote(id: string, value: string) {
    setNotes(prev => ({ ...prev, [id]: value }))
  }

  async function submit() {
    setSubmitting(true)
    const checks = items
      .filter(item => checked.has(item.id))
      .map(item => ({
        checklist_item_id: item.id,
        item_name: item.name,
        note: notes[item.id]?.trim() || null,
      }))

    const res = await fetch('/api/inspector/exit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_log_id: visitLogId, location_id: locationId, checks }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      setErrorMsg(data.error ?? 'שגיאה בשליחה')
      setSubmitting(false)
      setPhase('error')
    } else {
      setSubmitting(false)
      setPhase('success')
    }
  }

  function handleSubmitClick() {
    if (checked.size === 0) {
      setPhase('confirm-empty')
    } else {
      submit()
    }
  }

  if (phase === 'loading') {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (phase === 'no-params') {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        <AlertTriangle size={40} style={{ color: 'var(--warning)' }} />
        <p style={{ color: 'var(--muted)' }}>פרמטרים חסרים. חזור לעמוד הבית.</p>
        <button className="button button--primary" onClick={() => router.push('/inspector')}>חזור לבית</button>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20, textAlign: 'center' }}>
        <CheckCircle size={64} style={{ color: 'var(--success)' }} />
        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>הבדיקות נשמרו</div>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
          {checked.size > 0 ? `${checked.size} פריטים סומנו ונשמרו.` : 'הוגש ללא פריטים מסומנים.'}
        </p>
        <button className="button button--primary" style={{ width: '100%', maxWidth: 280 }}
          onClick={() => router.push('/inspector')}>
          חזור לבית
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', fontSize: '2.5rem' }}>✗</div>
        <div style={{ color: 'var(--danger)', fontWeight: 600 }}>שגיאה בשמירת הבדיקות</div>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>{errorMsg}</p>
        <button className="button button--ghost" onClick={() => router.push('/inspector')}>חזור לבית</button>
      </div>
    )
  }

  return (
    <div className="app" style={{ maxWidth: 480, margin: '0 auto', minHeight: '100svh' }}>
      <header className="appHeader">
        <button className="button button--icon button--ghost" style={{ color: '#fff', border: 'none' }}
          onClick={() => router.push('/inspector')}>
          <ArrowRight size={18} />
        </button>
        <div className="appHeader__title" style={{ flex: 1, textAlign: 'center' }}>רשימת בדיקות יציאה</div>
      </header>

      <div style={{ padding: '16px 14px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Inline confirmation: zero checked */}
        {phase === 'confirm-empty' && (
          <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--warning)' }}>
                <AlertTriangle size={16} />
                לא סומן אף פריט
              </div>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: 0 }}>
                האם להגיש את הרשימה ללא פריטים מסומנים?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button button--primary button--sm" onClick={submit}>כן, הגש בכל זאת</button>
                <button className="button button--ghost button--sm" onClick={() => setPhase('form')}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Inline confirmation: skip */}
        {phase === 'confirm-skip' && (
          <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 600, color: 'var(--warning)' }}>דילוג על רשימת הבדיקות</div>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: 0 }}>
                האם אתה בטוח שברצונך לדלג? הבדיקות לא יישמרו.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button button--danger button--sm" onClick={() => router.push('/inspector')}>כן, דלג</button>
                <button className="button button--ghost button--sm" onClick={() => setPhase('form')}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Checklist card */}
        {items.length === 0 ? (
          <div className="card">
            <div className="card__body">
              <p className="textMuted textSm" style={{ textAlign: 'center' }}>אין פריטים פעילים ברשימת הבדיקות.</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card__header">
              <div className="card__title">בדוק את הסעיפים שבוצעו</div>
            </div>
            <div className="card__body">
              <div className="checklistWrap">
                {items.map(item => {
                  const isChecked = checked.has(item.id)
                  return (
                    <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div
                        className={`checkItem${isChecked ? ' checkItem--checked' : ''}`}
                        onClick={() => toggleCheck(item.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(item.id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="checkItem__label">{item.name}</span>
                      </div>
                      {isChecked && (
                        <input
                          type="text"
                          placeholder="הערה (אופציונלי)"
                          value={notes[item.id] ?? ''}
                          onChange={e => setNote(item.id, e.target.value)}
                          style={{
                            marginRight: 26,
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            padding: '5px 10px',
                            fontSize: '.82rem',
                            background: '#fff',
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <p style={{ marginTop: 12, fontSize: '.78rem', color: 'var(--muted)' }}>
                {checked.size} מתוך {items.length} פריטים סומנו
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        {(phase === 'form' || phase === 'confirm-empty' || phase === 'confirm-skip') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="button button--primary"
              style={{ height: 50, fontSize: '1rem' }}
              onClick={handleSubmitClick}
            disabled={submitting}
            >
              {submitting ? <span className="spinner" /> : 'שמור בדיקות'}
            </button>
            <button
              className="button button--ghost"
              onClick={() => setPhase('confirm-skip')}
            >
              דלג על הבדיקות
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChecklistPage() {
  return (
    <Suspense fallback={
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100svh' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    }>
      <ChecklistInner />
    </Suspense>
  )
}
