@AGENTS.md

# Mashgiach App: Developer Reference

## Copy rule: no em dashes
Never use the em dash character (Unicode U+2014) in any UI copy, error messages, buttons, tooltips, labels, modal titles, push notification bodies, comments, or documentation. Use a colon, comma, hyphen, parentheses, or sentence break instead. This applies to all future code and documentation in this project.

## Stack
- Next.js (App Router, Turbopack). See AGENTS.md for version-specific notes.
- Supabase shared project `avgzxdfweopkmdldkivc` (hosted, not local)
- `@supabase/ssr` for cookie-based SSR auth; `@supabase/supabase-js` directly for service-role client
- Deployed on Vercel (repo: `TKPAPPS/Mashgiach-app`, public repo required for Hobby plan)

## Two Supabase clients: critical distinction
`lib/supabase/server.ts` exports two clients:

- `createClient()`: async, uses `@supabase/ssr` with cookies, respects RLS, for user-authenticated requests
- `createServiceClient()`: sync (NOT async), uses `@supabase/supabase-js` directly with the service role key, bypasses RLS

**Never `await createServiceClient()`** : it is synchronous. Using `await` on it silently passes but the key is treated as anon-level by `@supabase/ssr`, breaking RLS bypass. All API routes that need elevated access must use `const service = createServiceClient()` (no await).

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is in `sb_secret_` format (Supabase new-format key), not a JWT. It only works correctly when used via `@supabase/supabase-js` directly.

## Roles
- `admin`: full access via admin panel at `/admin`
- `mashgiach`: inspector access at `/inspector`
- Role is stored in `profiles.role`; RLS policies enforce it via a `mashgiach_is_admin()` DB function

## API routes: patterns
All admin API routes verify role:
1. `await createClient()` to get session user
2. Query `profiles.role` for that user, check for `admin`
3. `createServiceClient()` (no await) for elevated DB/auth operations

Inspector API routes authenticate but do NOT check role (inspectors hit `/api/inspector/*`).

## Inspector scan flow (security design)
- `/api/inspector/scan` always returns `{ success: true }` to the inspector regardless of outcome
- Internal status is logged privately in `visit_logs.internal_status`
- Four internal statuses: `success`, `unauthorized`, `invalid_location`, `gps_mismatch`
- GPS threshold: 100 metres (see `lib/utils/gps.ts` and `GPS_THRESHOLD_METERS`)
- `gps_mismatch` creates a row in `gps_alerts` (admin-visible, dismissible)
- The inspector never knows whether they triggered an alert
- On a successful exit scan, the API response includes `visit_log_id` and `location_id`. The scan page uses these to redirect to the checklist if active checklist items exist.

## Inspector forms: must call API routes for any submission with side effects
**Rule:** Any inspector form submission that triggers side effects (push notifications, elevated DB writes, system logs) MUST call a backend API route. Never insert directly from the client via `supabase.from(...).insert(...)`.

Reasons:
- Direct client inserts run as the inspector's anon session; they bypass service-role logic
- Direct inserts do not trigger push notifications to admins
- Direct inserts have no server-side error handling; failures are silent to the user

Current correct pattern:
- Deficiency report: `fetch('/api/inspector/report', { method: 'POST', ... })`
- Absence request: `fetch('/api/inspector/absence', { method: 'POST', ... })`
- Exit-form checklist: `fetch('/api/inspector/exit-form', { method: 'POST', ... })`

What each API route does beyond insertion:
- `/api/inspector/report`: inserts deficiency, then notifies admins via push
- `/api/inspector/absence`: inserts absence request, then notifies admins via push
- `/api/inspector/scan`: logs visit, validates GPS, creates gps_alerts if mismatch, logs to system_logs, notifies admins
- `/api/inspector/exit-form`: validates ownership + freshness, deletes prior checks, batch-inserts visit_checks

If you add a new inspector-facing form that writes to the DB, add it as an API route if it has any side effect, even if notification is not yet needed.

## Checklist / exit-form workflow (implemented in Phase 2)
After a successful exit scan, the scan API returns `visit_log_id` and `location_id`. The scan page checks for active checklist items client-side:
- If items exist: redirects to `/inspector/checklist?visit_log_id=...&location_id=...`
- If no items: shows normal success screen

The checklist page (`app/inspector/checklist/page.tsx`) shows all active global checklist items. The inspector checks completed items and can add an optional note per item. Only checked items are saved.

Behaviors:
- Submit with zero checked items: inline confirmation required before submitting
- Skip checklist: inline confirmation required before navigating home
- Duplicate submission is handled idempotently: the API deletes existing `visit_checks` for the visit_log before inserting

Security chain in `/api/inspector/exit-form`:
1. Auth: user must be logged in
2. Validate `visit_log_id` and `location_id` present
3. Fetch the visit_log: verify `inspector_id === user.id`, `action_type === 'exit'`, `location_id` matches
4. Reject if the visit_log is older than 24 hours
5. Verify inspector is assigned to the location via `inspector_locations`
6. Delete then re-insert visit_checks (idempotent)

`checklist_items` is a global table (no `location_id` column). All locations share the same checklist.

## Location create/edit: field scope
`LocationForm` (module-level component in `LocationsTab.tsx`) includes all text fields on both create and edit:
- Basic: name, city, address, QR code, GPS coords, status (edit only)
- Contact: contact_name, contact_phone, contact_email, contact_notes
- Kashrus: kashrus_procedure (free text)

Fields that require the record ID and stay in `LocationDetailModal` only:
- `kashrus_certificate_url`: file upload needs location ID for storage path
- `kashrus_procedure_file_url`: same
- Inspector assignment: needs location ID for `inspector_locations` join

## Inspector authorization on location detail page
`app/inspector/location/[id]/page.tsx` verifies the inspector is assigned to the location via `inspector_locations` before rendering. Unassigned inspectors are redirected to `/inspector`. Do not remove this check.

## Absence request lifecycle
`absence_requests` has an admin workflow:
- `admin_status`: `pending` (default), `approved`, or `denied`
- `admin_notes`: free text for admin reason/comment
- Admin manages these in the Absences tab (inline status dropdown and notes save button)
- Inspector submits via `fetch('/api/inspector/absence', ...)` which triggers a push notification

## Admin password reset
- Admin can reset any inspector's email and/or password via the key icon button in the Inspectors tab
- Opens a focused modal, calls `PATCH /api/admin/users` with `{ id, email?, password? }`
- Profile edit (pencil icon) only updates name, start date, vacation days; no credentials
- Credentials and profile are deliberately separated to reduce accidental changes

## Storage buckets
- `contracts`: private; stores inspector employment contracts; URLs are generated on demand via signed URLs (1-hour expiry)
- `certificates`: public; stores kosher certificates for locations
- `kashrus-procedures`: private

## Contract URL handling
- `profiles.contract_url` stores the raw storage path (e.g. `contracts/<inspector-id>/file.pdf`), NOT a public URL.
- Admin contract view: `GET /api/admin/contract-url?inspector_id=X` verifies admin role, generates a signed URL, returns `{ url }`. Opens in new tab.
- Inspector contract view: `GET /api/inspector/contract-url` uses the authenticated user's own profile; inspector cannot fetch another inspector's contract.
- Both routes handle both raw paths and legacy public URL format (extracts path from URL pattern) to support any rows that may have been stored differently.
- Do NOT call `getPublicUrl` on the `contracts` bucket; it is private and will 403.
- Full upload/view QA requires an actual uploaded contract file in the DB; automated QA only verified API auth behavior (401/404). Manual QA still pending (see Phase 4 remaining manual QA).

## Reports and Logs: 30-day default window
- `ReportsTab` and `SystemLogsTab` both default to fetching the last 30 days server-side (`.gte('created_at', thirtyDaysAgo)`).
- The `from` filter state is initialized to 30 days ago. An explicit "טען" button re-fetches from the server with the current `from` date.
- A Hebrew hint note is shown below the filter row: to view older data, change the start date and click "טען".
- Client-side filters (inspector, location, action, `to` date, search) still apply to the loaded window without a re-fetch.

## Inactive locations on inspector home
- Inspectors see their inactive assigned locations but they are non-interactive: no click navigation, no scan button, no check-in badge.
- The card is rendered at 55% opacity with `cursor: default`.
- Only the "לא פעיל" badge is shown; the "בפנים"/"בחוץ" badge is hidden for inactive cards.

## Checklist grouping in LocationDetailModal
- The "בדיקות" (checks) tab groups `visit_checks` by `visit_log_id`.
- Each group is rendered as a card with a shared header showing date and inspector name.
- Fetch limit is 100 rows (was 20).

## Deficiency admin notes
- `DeficienciesTab` and `LocationDetailModal` deficiencies tab both use controlled input state for `admin_notes`.
- A "שמור" button appears inline only when the value has changed from the stored value (dirty check).
- The `onBlur`-based pattern has been removed to prevent data loss on tab navigation.

## GPS alert lifecycle
Alerts appear on the admin Dashboard when an inspector scans from > 100m away.
- Informational and actionable: admin should investigate and dismiss
- Individual dismiss: "סמן כנקרא" per row
- Bulk dismiss: "סמן הכל כנקרא" button in header
- Dismissed alerts (read=true) are hidden from the dashboard banner
- Alerts are permanent in the `gps_alerts` table; only the `read` flag changes

## QR code display
- Admin Locations tab: the QR icon button opens a modal with a rendered QR image (`QRCodeSVG` from `qrcode.react`).
- The QR code value is the location's `qr_code` string (e.g. `LOC-XXXX-XXXX`).
- The raw text string is also shown below the image for manual entry.
- A download button renders a 600px `QRCodeCanvas` offscreen and downloads it as PNG.
- Inspector scan page accepts the QR value via camera scan or manual text entry.

## Logs tab (SystemLogsTab)
- Shows `visit_logs` (all scan attempts: entry, exit, invalid, unauthorized, GPS mismatch).
- Dashboard shows only the most recent 50 logs; the Logs tab fetches up to 500 with a search filter.
- `system_logs` table still exists and receives entries from successful authorized scans; it is not shown in the UI currently.

## Admin header
- The user info section (`appHeader__user`) is always rendered but hidden (`visibility: hidden`) until the profile loads. This reserves space and prevents layout shift on mount.

## Push notifications
- VAPID keys in `.env.local`
- `POST /api/push/notify` sends to all admin subscribers
- Triggered by: inspector scan (entry/exit), deficiency report, absence request
- Notification body for absence: `"{inspector name}, {request type in Hebrew}"`
- Failed notification calls are swallowed in a try/catch; they never fail the submission

## Inspector profile
- The profile tab shows the inspector's email (read-only, fetched from `supabase.auth.getUser()` on the client).
- Inspector can change their own password via a form in the profile tab. Uses `supabase.auth.updateUser({ password })`. No current password required; the active session proves identity. Validates: length >= 6, confirm match.
- Inspector cannot change their own email. Admin must do it via the key icon credentials modal in the Inspectors tab.

## Admin inspector email visibility
- Admin Inspectors tab shows an email column fetched from `GET /api/admin/users`, which calls `service.auth.admin.listUsers()`.
- Email is also shown in the inspector detail modal.
- Email lives only in Supabase Auth, not in `profiles`.

## Replacement inspector selection
- Inspector side: when absence type is "החלפה" and a location is selected, the form calls `GET /api/inspector/replacements?location_id=X`.
  - The route verifies the requesting inspector is assigned to the location, then returns all other inspectors also assigned there.
  - If no replacements are available: shows "אין משגיחים זמינים למיקום זה". Form can still be submitted without a replacement.
  - `replacement_inspector_id` is included in the POST body to `/api/inspector/absence`.
- Admin side: the "ממלא מקום" column in AbsencesTab shows an editable `<select>` for `request_type === 'replacement'` rows only.
  - Shows inspectors assigned to the same location first (in an optgroup), then all others.
  - On change: updates `absence_requests.replacement_inspector_id` directly via the admin Supabase client.
  - For non-replacement types, shows a static read-only display.

## Check-in state indicator
- Inspector home location cards show a "בפנים" (green) or "בחוץ" (muted) badge based on the most recent VisitLog action_type.
- Derived from `visitMap` already built in `loadAll()`. No additional data fetch needed.
- "בפנים" = last action was `entry`. "בחוץ" = last action was `exit`, or no visit history.

## QA credential safety rules
- Do not change real admin or user passwords during QA unless explicitly approved by the user first.
- Do not paste live passwords or temporary test passwords into chat reports or documentation. Report only that a password was changed, not the value.
- Prefer purpose-built test accounts for browser QA instead of real admin accounts.
- If a password must be changed for testing, restore it immediately after the test and confirm restoration.
- Admin password changes require explicit user approval each time, even in a QA context. Prior approval for one QA run does not carry over.

## Known lint patterns (future cleanup)
13+ files use `useEffect(() => { loadFn() }, [])` with an async inner function that calls `setState`. This triggers `react-hooks/exhaustive-deps` warnings. The pattern is intentional (load-once on mount). Fixing all instances requires systematic `useCallback` or `.then()` refactoring across the codebase. Deferred to a dedicated future cleanup phase. Do not fix as part of feature work unless the file is already being substantially rewritten.

## Known issues (pending future phases)
- `kashrus_procedure_file_url` field exists in schema but is not wired anywhere in UI
