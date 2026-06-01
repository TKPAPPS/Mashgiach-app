# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Mashgiach App: Developer Reference

## Commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build + TypeScript check
npm run lint     # ESLint
```

No test runner is configured. Verification is done with Playwright against the live dev server or production URL `https://mashgiach.tkpapps.com`.

## Copy rule: no em dashes

Never use the em dash character (Unicode U+2014) in any UI copy, error messages, buttons, tooltips, labels, modal titles, push notification bodies, comments, or documentation. Use a colon, comma, hyphen, parentheses, or sentence break instead.

## Stack

- Next.js 16 (App Router, Turbopack). See AGENTS.md for version-specific notes.
- Supabase project `avgzxdfweopkmdldkivc` (hosted, not local)
- `@supabase/ssr` for cookie-based SSR auth; `@supabase/supabase-js` directly for service-role client
- Deployed on Vercel (repo: `TKPAPPS/Mashgiach-app`, public repo required for Hobby plan)
- Service worker + web-push for push notifications

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         # sb_secret_ format (NOT a JWT)
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT                     # mailto: address
NEXT_PUBLIC_BASE_URL              # https://mashgiach.tkpapps.com in production
```

## Architecture overview

Two user-facing surfaces sharing a single Next.js app:

**Inspector side** (`/inspector/*`) — mobile-first (max-width 480px), bottom nav, designed for phones. Inspectors scan QR codes, submit deficiency reports, request absences, and view location details.

**Admin side** (`/admin`) — full-width dashboard SPA rendered as a single page with tab switching. All admin state lives in `AdminShell.tsx` (tab state, shared lookups, refreshKey). Ten tabs mount lazily and stay in DOM hidden with `display:none` when inactive — never unmount on tab switch.

```
app/
  admin/page.tsx          → renders <AdminShell />
  inspector/page.tsx      → inspector home (all 4 tabs: home, report, absence, profile)
  inspector/scan/         → QR camera scan page
  inspector/checklist/    → post-exit checklist
  inspector/location/[id] → location detail
  api/
    admin/                → admin API routes (all require requireAdmin())
    inspector/            → inspector API routes (require auth, not role check)
    push/                 → subscribe (POST/DELETE) and notify (POST, admin only)

components/admin/         → all admin tab components
lib/
  supabase/
    client.ts             → createClient() for browser components
    server.ts             → createClient() (async, SSR) + createServiceClient() (sync)
    types.ts              → all DB types + Database type for Supabase generics
  utils/
    format.ts             → formatDateTime, formatDate, formatRelative, statusLabel, actionLabel, etc.
    gps.ts                → distanceMeters(), GPS_THRESHOLD_METERS (100m)
    notifyAdmins.ts       → push notification utility (call directly, never via HTTP)
    excel.ts              → exportToExcel()
```

## Two Supabase clients: critical distinction

`lib/supabase/server.ts` exports two clients:

- `createClient()`: **async**, uses `@supabase/ssr` with cookies, respects RLS — for authenticated user requests
- `createServiceClient()`: **sync (NOT async)**, uses `@supabase/supabase-js` directly with service role key, bypasses RLS

**Never `await createServiceClient()`**: it is synchronous. Using `await` on it silently passes but the key is treated as anon-level by `@supabase/ssr`, breaking RLS bypass. All routes needing elevated access must use `const service = createServiceClient()` (no await).

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is in `sb_secret_` format, not a JWT. It only works correctly when used via `@supabase/supabase-js` directly.

## Roles

- `admin`: full access via admin panel at `/admin`
- `mashgiach`: inspector access at `/inspector`
- Role stored in `profiles.role`; RLS policies enforce it via `mashgiach_is_admin()` DB function

## API routes: patterns

All admin API routes verify role via `requireAdmin()`:
```typescript
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}
```

Inspector API routes authenticate but do NOT check role (inspectors hit `/api/inspector/*`).

**Error messages**: return generic Hebrew strings (`'שגיאה בשמירה'` etc.), not raw `error.message` from Supabase — schema fingerprinting risk.

## Push notifications: always use the utility

**Never call `fetch('/api/push/notify', ...)`** from within server-side code. The HTTP endpoint is admin-auth-gated and exists only for potential future admin UI use. Instead, call the utility directly:

```typescript
import { notifyAdmins } from '@/lib/utils/notifyAdmins'
await notifyAdmins({ title: '...', body: '...', url: '/admin' })
```

The utility handles VAPID config check, fetches admin subscriptions, sends via `web-push`, and cleans up expired subscriptions.

**Push subscription UI**: a Bell/BellOff button in the admin header (`AdminShell.tsx`) calls `PushManager.subscribe()` and POSTs to `/api/push/subscribe`. The DELETE endpoint is scoped by `user_id` to prevent cross-user unsubscription.

## Inspector scan flow (security design)

- `/api/inspector/scan` always returns `{ success: true }` to the inspector regardless of outcome
- Internal status logged privately in `visit_logs.internal_status`
- Four statuses: `success`, `unauthorized`, `invalid_location`, `gps_mismatch`
- GPS threshold: 100 metres (`GPS_THRESHOLD_METERS` in `lib/utils/gps.ts`)
- `gps_mismatch` creates a `gps_alerts` row (admin-visible, dismissible; includes `visit_log_id` for GPS coord lookup)
- On successful exit scan, API returns `visit_log_id` and `location_id`. Scan page redirects to checklist if active items exist.
- On successful entry scan, "צפה בפרטי המקום" button navigates to `/inspector/location/{location_id}`

## Inspector forms: must call API routes

Any inspector submission with side effects MUST call a backend API route — never insert directly via the Supabase client. Current routes:
- `/api/inspector/scan` — logs visit, validates GPS, creates alerts, notifies admins
- `/api/inspector/report` — validates inspector is assigned to location, inserts deficiency, notifies admins
- `/api/inspector/absence` — validates enum values and dates, validates replacement is a real mashgiach, notifies admins
- `/api/inspector/exit-form` — validates ownership + freshness, batch-inserts visit_checks

## File upload security (admin-reports bucket)

`/api/admin/location-report-attachments` enforces:
- 20 MB max file size (checked server-side before `arrayBuffer()`)
- MIME type allowlist: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`
- Extension derived from the allowlist map (not from `file.name`) to prevent extension spoofing
- Images are re-encoded via `sharp` (resize + JPEG conversion) — unrecognized image bytes throw a 400
- DELETE scoped to `admin_id` — admins can only delete their own attachments
- Report DELETE purges storage files before removing the DB row

## Admin panel performance architecture

### Lazy tab mounting
```tsx
{mountedTabs.has('dashboard') && (
  <div style={{ display: tab === 'dashboard' ? undefined : 'none' }}>
    <DashboardTab ... />
  </div>
)}
```
A tab mounts on first visit and stays in DOM hidden. Never unmount on tab switch; never reset `mountedTabs` on refresh.

### Shared lookup data at AdminShell level
`AdminShell` fetches `profiles`, `locations`, `inspector_locations`, and `/api/admin/users` once in `loadShared()` and passes as props. Do not re-fetch in child tabs. Types: `SharedInspector`, `SharedLocation`, `SharedIL` (exported from `AdminShell.tsx`).

### refreshKey as shared effect dependency
Each tab uses `useEffect(() => { loadAll() }, [refreshKey])`. On mount `refreshKey === 0`. On refresh button, `refreshKey` increments and tabs re-fetch.

### DashboardTab auto-refresh
30-second interval calls `loadAll()` only when `!document.hidden` to avoid wasted requests when browser tab is in background.

## Responsive CSS classes

Defined in `app/globals.css`:
- `.filtersGrid` — 2-col → 3-col → 5-col at breakpoints
- `.statsGrid` — 2-col → 4-col at ≥640px
- `.summaryGrid` — 2-col → 1-col at ≤600px (dashboard bottom tables)
- `.fieldRow` / `.fieldRow3` — 2/3-col → 1-col at ≤420px (modal form rows)
- `.infoGrid` — 2-col → 1-col at ≤480px (detail modal info sections)
- `.button--icon` — `padding: 10px` at ≤640px for mobile touch targets
- Modals: bottom-sheet style at ≤480px (`align-items: flex-end`, no padding, top-rounded corners)

## Inspector profile: history section

The profile tab includes `InspectorHistory` (defined in `app/inspector/page.tsx`) — a collapsible section fetching the inspector's own `absence_requests` and `deficiency_reports` via the Supabase client directly (RLS scopes to `inspector_id = user.id`).

## Absence request lifecycle

- `admin_status`: `pending` (default), `approved`, `denied`
- `admin_notes`: free text reason/comment
- Admin manages in the Absences tab (inline status dropdown + notes save button)
- Inspector submits via `/api/inspector/absence` which triggers a push notification
- `request_type` must be one of: `vacation`, `absence`, `replacement`, `other`

## Admin reports (location visit reports)

Admin-authored reports per location with text body, attached files, and follow-up action items. Stored in `admin_location_reports`, `admin_report_attachments`, `admin_report_followups`. PATCH/DELETE on reports is scoped to `admin_id` — admins can only modify their own reports. All delete confirmation dialogs use `<Modal>` components (not `window.confirm` — broken in iOS PWA).

## Admin tab names (for reference)

The "לוגי ביקורים" tab (id: `reports`) shows `visit_logs` scan history — not deficiency reports. The deficiency reports tab is "ליקויי כשרות" (id: `deficiencies`). This naming is intentional.

## Location create/edit: field scope

`LocationForm` (in `LocationsTab.tsx`) handles: name, city, address, QR code, GPS coords, status, contact fields, kashrus_procedure. Fields requiring a record ID stay in `LocationDetailModal` only: `kashrus_certificate_url` (file upload), inspector assignment.

## Storage buckets

- `contracts` — private; signed URLs via `/api/admin/contract-url` or `/api/inspector/contract-url`
- `certificates` — public; kosher certificates for locations
- `kashrus-procedures` — private
- `admin-reports` — private; signed URLs per attachment (1-hour expiry)

## Contract URL handling

`profiles.contract_url` stores the raw storage path (`contracts/<id>/file.pdf`), not a public URL. Both admin and inspector contract routes call `createSignedUrl` on the private bucket. Do NOT call `getPublicUrl` on `contracts` — it is private and will 403.

## Admin password reset

The key icon in the Inspectors tab opens a credentials modal for email/password reset via `PATCH /api/admin/users`. The pencil icon only updates name, start date, vacation days. Credentials and profile are deliberately separated.

## QR code display

QR icon button in Locations tab opens a modal with `QRCodeSVG` from `qrcode.react`. Download uses offscreen `QRCodeCanvas` at 600px then `canvas.toDataURL`. Inspector scan accepts camera scan or manual text entry.

## Inactive locations on inspector home

Inactive locations render at 55% opacity with `cursor: default` and no click handler — no scan button, no check-in badge, only the "לא פעיל" badge.

## Check-in state indicator

Inspector home location cards show "בפנים" (entry) or "בחוץ" (exit / no history) derived from the `visitMap` built in `loadAll()`. No additional fetch needed.

## GPS alert lifecycle

Dashboard alerts appear when inspector scans from >100m. Individual dismiss ("סמן כנקרא") or bulk dismiss. `gps_alerts` joins `visit_logs` to expose `device_lat`/`device_lng` for a Google Maps link in the alerts table. Only `read` flag changes; rows are permanent.

## Replacement inspector selection

Inspector side: `/api/inspector/replacements?location_id=X` returns only inspectors also assigned to that location. Admin side: dropdown in AbsencesTab shows assigned inspectors first (optgroup), then all others.

## Checklist grouping in LocationDetailModal

"בדיקות" tab groups `visit_checks` by `visit_log_id`, rendered as cards with date + inspector header. Fetch limit: 100 rows.

## Deficiency admin notes

`DeficienciesTab` and `LocationDetailModal` use controlled input state for `admin_notes`. A "שמור" button appears only when value differs from stored value (dirty check). No `onBlur`-based save.

## Logs tab (SystemLogsTab)

Shows `visit_logs` (up to 500 with search filter). Note: `system_logs` table also exists and receives entries from successful scans but is not exposed in any UI tab.

## Admin header

`appHeader__user` is always rendered but `visibility: hidden` until profile loads — reserves space and prevents layout shift.

## LocationsTab edit pattern

List query selects display columns only. Clicking edit calls `openForEdit()` which fetches `select('*')` for the single location before opening the modal.

## LocationDetailModal form key trick

Forms using `defaultValue` must have `key={location.updated_at ?? 'loading'}` so React re-mounts them when async data arrives.

## QA credential safety rules

- Do not change real admin or user passwords during QA unless explicitly approved by the user first.
- Do not paste live passwords or temporary test passwords into chat reports or documentation.
- Never `await createServiceClient()`: it is synchronous.
- Never use the em dash character (Unicode U+2014) in any UI copy, error messages, buttons, tooltips, labels, modal titles, push notification bodies, comments, or documentation.

## Known lint patterns (future cleanup)

13+ files use `useEffect(() => { loadFn() }, [])` with async inner functions triggering `react-hooks/exhaustive-deps` warnings. The pattern is intentional (load-once on mount). Deferred to a dedicated cleanup phase.

## Known issues (pending future phases)

- `kashrus_procedure_file_url` field exists in schema but is not wired in any UI
- `system_logs` table receives scan entries but has no admin UI view
- PWA icons (`/icon-192.png`, `/icon-512.png`) referenced in manifest.json but not present — push notification icons will show broken image; only `favicon.png` exists
- Vacation days balance (`vacation_days_remaining`) is not auto-deducted when admin approves a vacation request
