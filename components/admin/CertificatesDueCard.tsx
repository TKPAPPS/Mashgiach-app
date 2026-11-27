'use client'
import { useEffect, useState } from 'react'
import { FileWarning } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { certStatus, certBadgeClass, fmtDay, bangkokToday, CERT_WARN_DAYS } from '@/lib/utils/certExpiry'

type Row = { id: string; name: string; kashrus_certificate_expires_on: string }

// Dashboard: kashrut certificates to renew (expired or within 30 days), and how
// many certificates still have no expiry date. Hidden when there is nothing to do.
export default function CertificatesDueCard({ refreshKey }: { refreshKey?: number }) {
  const [due, setDue] = useState<Row[] | null>(null)
  const [noDate, setNoDate] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    const until = new Date(Date.parse(`${bangkokToday()}T00:00:00Z`) + CERT_WARN_DAYS * 86400_000).toISOString().slice(0, 10)
    Promise.all([
      supabase.from('locations').select('id,name,kashrus_certificate_expires_on')
        .eq('status', 'active').not('kashrus_certificate_expires_on', 'is', null).lte('kashrus_certificate_expires_on', until)
        .order('kashrus_certificate_expires_on'),
      supabase.from('locations').select('id', { count: 'exact', head: true })
        .eq('status', 'active').not('kashrus_certificate_url', 'is', null).is('kashrus_certificate_expires_on', null),
    ]).then(([a, b]) => { setDue((a.data ?? []) as Row[]); setNoDate(b.count ?? 0) })
  }, [refreshKey])

  if (due === null || (due.length === 0 && noDate === 0)) return null

  return (
    <div className="card" data-testid="certs-due">
      <div className="card__header--inline">
        <div className="card__title"><FileWarning size={16} style={{ verticalAlign: '-3px', marginLeft: 6 }} />תעודות כשרות לחידוש</div>
      </div>
      <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {due.length === 0
          ? <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted)' }}>אין תעודה שפוקעת ב-30 הימים הקרובים.</p>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {due.map(r => {
                const st = certStatus(r.kashrus_certificate_expires_on)!
                return (
                  <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ minWidth: 120 }}>{r.name}</strong>
                    <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{fmtDay(r.kashrus_certificate_expires_on)}</span>
                    <span className={`badge ${certBadgeClass(st.kind)}`}>{st.text}</span>
                  </li>
                )
              })}
            </ul>}
        {noDate > 0 && (
          <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--warning)' }}>
            <strong>{noDate}</strong> תעודות עדיין בלי תאריך תפוגה, ולכן לא תצא עליהן התראה. מזינים ב: מקומות &gt; פרטים מלאים &gt; תעודת כשרות.
          </p>
        )}
      </div>
    </div>
  )
}
