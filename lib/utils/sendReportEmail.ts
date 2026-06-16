import { Resend } from 'resend'

const FROM = process.env.REPORT_FROM_EMAIL || 'Mashgiach <Mashgiach@tkpapps.com>'

// Sends the daily report via Resend. No-ops (returns ok:false) when the API key
// is missing, mirroring the guard style in notifyAdmins.ts so a missing key
// never throws in the cron/test paths.
export async function sendReportEmail(
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' }
  if (!to.length) return { ok: false, error: 'No recipients configured' }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
