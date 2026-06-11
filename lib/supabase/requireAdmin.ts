import { createClient } from '@/lib/supabase/server'

// Shared admin gate for admin API routes: returns the authenticated user when
// their profile role is 'admin', otherwise null. Callers respond 401/403.
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}
