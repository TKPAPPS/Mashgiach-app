'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
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

    // Fetch role
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('שגיאה בהתחברות'); setLoading(false); return }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') router.push('/admin')
    else router.push('/inspector')
  }

  return (
    <div className="loginWrap">
      <div className="loginCard">
        <div className="loginCard__brand">
          <div className="iconWrap">
            <ShieldCheck size={28} />
          </div>
          <h1>מעקב ביקורי משגיחים</h1>
          <p>מערכת מעקב ובקרה</p>
        </div>

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
            {loading ? <span className="spinner" /> : 'התחברות'}
          </button>
        </form>
      </div>
    </div>
  )
}
