'use client'
import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
      router.replace('/admin')
    }
  }, [router])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError('אימייל או סיסמה שגויים')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('שגיאה בהתחברות'); setLoading(false); return }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') router.push('/admin')
    else router.push('/inspector')
  }

  return (
    <div className="loginWrap">
      <div className="loginCard">
        <div className="loginCard__top">
          <Image
            src="/logo.png"
            alt="The Kosher Place Mashgiach"
            width={220}
            height={124}
            priority
            className="loginCard__logo"
          />
          <p className="loginCard__subtitle">מערכת מעקב ובקרה למשגיחים</p>
        </div>

        <div className="loginCard__body">
          {error && <div className="errorBox">{error}</div>}

          <form className="form" onSubmit={handleSubmit}>
            <label className="field field--ltr">
              <span>אימייל</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field field--ltr">
              <span>סיסמה</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="button button--primary button--wide button--lg" type="submit" disabled={loading}>
              {loading ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : 'התחברות'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
