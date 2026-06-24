// Shared persistent cookie options for the @supabase/ssr clients (browser,
// server, and middleware). Makes the auth cookies explicitly long-lived and
// consistent so a logged-in session is remembered across app launches.
// `secure` is gated to production so login still works over http://localhost.
export const PERSIST_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
}
