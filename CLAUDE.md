@AGENTS.md

# Mashgiach App — Developer Reference

## Stack
- Next.js (App Router, Turbopack) — see AGENTS.md for version-specific notes
- Supabase shared project `avgzxdfweopkmdldkivc` (hosted, not local)
- `@supabase/ssr` for cookie-based SSR auth; `@supabase/supabase-js` directly for service-role client
- Deployed on Vercel (repo: `TKPAPPS/Mashgiach-app`, public repo required for Hobby plan)

## Two Supabase clients — critical distinction
`lib/supabase/server.ts` exports two clients:

- `createClient()` — async, uses `@supabase/ssr` with cookies, respects RLS, for user-authenticated requests
- `createServiceClient()` — sync (NOT async), uses `@supabase/supabase-js` directly with the service role key, bypasses RLS

**Never `await createServiceClient()`** — it is synchronous. Using `await` on it silently passes but the key is treated as anon-level by `@supabase/ssr`, breaking RLS bypass. All API routes that need elevated access must use `const service = createServiceClient()` (no await).

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is in `sb_secret_` format (Supabase new-format key), not a JWT. It only works correctly when used via `@supabase/supabase-js` directly.

## Roles
- `admin` — full access via admin panel at `/admin`
- `mashgiach` — inspector access at `/inspector`
- Role is stored in `profiles.role`; RLS policies enforce it via a `mashgiach_is_admin()` DB function

## API routes — patterns
All admin API routes verify role:
1. `await createClient()` → get session user
2. Query `profiles.role` for that user → check for `admin`
3. `createServiceClient()` (no await) for elevated DB/auth operations

Inspector API routes authenticate but do NOT check role (inspectors hit `/api/inspector/*`).

## Inspector scan flow (security design)
- `/api/inspector/scan` always returns `{ success: true }` to the inspector regardless of outcome
- Internal status is logged privately in `visit_logs.internal_status`
- Four internal statuses: `success`, `unauthorized`, `invalid_location`, `gps_mismatch`
- GPS threshold: 100 metres (see `lib/utils/gps.ts` → `GPS_THRESHOLD_METERS`)
- `gps_mismatch` creates a row in `gps_alerts` (admin-visible, dismissible)
- The inspector never knows whether they triggered an alert

## Inspector forms — must call API routes for any submission with side effects
**Rule:** Any inspector form submission that triggers side effects (push notifications, elevated DB writes, system logs) MUST call a backend API route. Never insert directly from the client via `supabase.from(...).insert(...)`.

Reasons:
- Direct client inserts run as the inspector's anon session — they bypass service-role logic
- Direct inserts do not trigger push notifications to admins
- Direct inserts have no server-side error handling; failures are silent to the user

Current correct pattern:
- Deficiency report → `fetch('/api/inspector/report', { method: 'POST', ... })`
- Absence request → `fetch('/api/inspector/absence', { method: 'POST', ... })`
- Exit-form checklist → `fetch('/api/inspector/exit-form', { method: 'POST', ... })` (Phase 2)

**What each API route does beyond insertion:**
- `/api/inspector/report` — inserts deficiency, then notifies admins via push
- `/api/inspector/absence` — inserts absence request, then notifies admins via push
- `/api/inspector/scan` — logs visit, validates GPS, creates gps_alerts if mismatch, logs to system_logs, notifies admins
- `/api/inspector/exit-form` — batch-inserts visit_checks (Phase 2)

If you add a new inspector-facing form that writes to the DB, add it as an API route if it has any side effect, even if notification is not yet needed.

## Location create/edit — field scope
`LocationForm` (module-level component in `LocationsTab.tsx`) now includes all text fields on both create and edit:
- Basic: name, city, address, QR code, GPS coords, status (edit only)
- Contact: contact_name, contact_phone, contact_email, contact_notes
- Kashrus: kashrus_procedure (free text)

Fields that require the record ID and stay in `LocationDetailModal` only:
- `kashrus_certificate_url` — file upload needs location ID for storage path
- `kashrus_procedure_file_url` — same
- Inspector assignment — needs location ID for `inspector_locations` join

## Inspector authorization on location detail page
`app/inspector/location/[id]/page.tsx` verifies the inspector is assigned to the location via `inspector_locations` before rendering. Unassigned inspectors are redirected to `/inspector`. Do not remove this check.

## Absence request lifecycle
`absence_requests` has an admin workflow:
- `admin_status`: `pending` (default) | `approved` | `denied`
- `admin_notes`: free text for admin reason/comment
- Admin manages these in the Absences tab (inline status dropdown + notes save button)
- Inspector submits via `fetch('/api/inspector/absence', ...)` which triggers a push notification

## Admin password reset
- Admin can reset any inspector's email and/or password via the **key icon** (🔑) button in the Inspectors tab
- Opens a focused modal, calls `PATCH /api/admin/users` with `{ id, email?, password? }`
- Profile edit (pencil icon) only updates name, start date, vacation days — no credentials
- Credentials and profile are deliberately separated to reduce accidental changes

## Storage buckets
- `contracts` — private; stores inspector employment contracts; URLs generated with `createSignedUrl` (TODO: currently uses getPublicUrl — see known issue below)
- `certificates` — public; stores kosher certificates for locations
- `kashrus-procedures` — private

## GPS alert lifecycle
Alerts appear on the admin Dashboard when an inspector scans from > 100m away.
- Informational + actionable: admin should investigate and dismiss
- Individual dismiss: "סמן כנקרא" per row
- Bulk dismiss: "סמן הכל כנקרא" button in header
- Dismissed alerts (read=true) are hidden from the dashboard banner
- Alerts are permanent in the `gps_alerts` table — only the `read` flag changes

## Checklist / exit-form (Phase 2 — not yet wired)
`/api/inspector/exit-form` exists and is correct but is not yet called from the client. The `visit_checks` table will be empty until Phase 2 is implemented. Do not delete the exit-form route.

## Push notifications
- VAPID keys in `.env.local`
- `POST /api/push/notify` sends to all admin subscribers
- Triggered by: inspector scan (entry/exit), deficiency report, absence request
- Notification body for absence: `"{inspector name} — {request type in Hebrew}"`
- Failed notification calls are swallowed in a try/catch — they never fail the submission

## QR code display
- Admin Locations tab: the QR icon button opens a modal with a rendered QR image (`QRCodeSVG` from `qrcode.react`).
- The QR code value is the location's `qr_code` string (e.g. `LOC-XXXX-XXXX`).
- The raw text string is also shown below the image for manual entry.
- Inspector scan page accepts the QR value via camera scan or manual text entry.

## Logs tab (SystemLogsTab)
- Shows `visit_logs` (all scan attempts: entry, exit, invalid, unauthorized, GPS mismatch).
- Dashboard shows only the most recent 50 logs; the Logs tab fetches up to 500 with a search filter.
- `system_logs` table still exists and receives entries from successful authorized scans — it is not shown in the UI currently.

## Admin header
- The user info section (`appHeader__user`) is always rendered but hidden (`visibility: hidden`) until the profile loads. This reserves space and prevents layout shift on mount.

## Known issues (pending future phases)
- Contract URLs use `getPublicUrl` on a private bucket — links won't work publicly (Phase 4)
- Checklist/exit-form client wiring missing (Phase 2)
- Inspector profile tab does not show email or offer password change (Phase 3)
- Replacement inspector not selectable in absence form (Phase 3)
- `kashrus_procedure_file_url` field exists in schema but is not wired anywhere in UI
