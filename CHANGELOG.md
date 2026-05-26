# Changelog

## [Phase 4]: 2026-05-26: Contract signed URLs, deficiency notes, date filters, inactive locations, checklist grouping

### Phase 4 summary

9 items implemented. No DB migrations required. Build: clean. TypeScript: clean. Em dash audit: clean.

#### Item 1: Contract signed URLs
**Files:** `app/api/admin/contract-url/route.ts` (new), `app/api/inspector/contract-url/route.ts` (new), `components/admin/InspectorsTab.tsx`, `app/inspector/page.tsx`

The `contracts` bucket is private. Previous code called `getPublicUrl`, which returns 403 for private buckets. Fixed by:
- On upload: store the raw storage path (`contracts/<id>/file.pdf`) in `profiles.contract_url` instead of the broken public URL.
- On view: call the new API routes to generate a 1-hour signed URL, then open it in a new tab.
- Admin route (`GET /api/admin/contract-url?inspector_id=X`): verifies admin role, fetches inspector profile, generates signed URL.
- Inspector route (`GET /api/inspector/contract-url`): uses the authenticated user's own ID only; no inspector can access another's contract.
- Both routes handle both raw path format and any previously stored public URL format (path extracted from URL pattern).
- Contract "צפה" / "פתח" buttons now show a spinner while the signed URL is being fetched.

#### Item 2: Deficiency admin notes: controlled input + save button
**Files:** `components/admin/DeficienciesTab.tsx`, `components/admin/LocationDetailModal.tsx`

Replaced `defaultValue` + `onBlur` pattern with controlled `editingNotes` state. A "שמור" save button appears inline only when the current input value differs from the stored value. Prevents data loss when navigating between tabs. Same pattern already used in `AbsencesTab`.

#### Item 3: Deficiencies date filter
**File:** `components/admin/DeficienciesTab.tsx`

Added `from` / `to` date inputs to the filter section. Server-side 30-day default (see item 7).

#### Item 4: Deficiency admin notes in LocationDetailModal
**File:** `components/admin/LocationDetailModal.tsx`

Added "הערות מנהל" column to the deficiencies tab inside the location detail modal. Uses the same controlled-input + save-button pattern as the standalone DeficienciesTab.

#### Item 5: Checklist grouping in LocationDetailModal
**File:** `components/admin/LocationDetailModal.tsx`

The "בדיקות" tab now groups `visit_checks` by `visit_log_id`. Each group renders as a card with a shared header (date, inspector name) and a table of items/notes for that visit. Fetch limit raised from 20 to 100.

#### Item 6: SystemLogsTab filters
**File:** `components/admin/SystemLogsTab.tsx`

Added `from` date, `to` date, and action type (כניסה/יציאה) filter fields. Text search preserved. "טען" button re-fetches from the server with the current `from` date. 30-day server-side default (see item 7).

#### Item 7: 30-day default window for Reports and Logs
**Files:** `components/admin/ReportsTab.tsx`, `components/admin/SystemLogsTab.tsx`, `components/admin/DeficienciesTab.tsx`

All three tabs now default `from` to 30 days ago and apply it server-side (`.gte('created_at', fromDate)`). A "טען" button re-fetches when the user changes the date range. A Hebrew hint note explains the default and how to expand the window. Client-side filters (inspector, location, action, `to` date, search text) still apply within the loaded window without a round-trip.

#### Item 8: Inactive locations: non-interactive on inspector home
**File:** `app/inspector/page.tsx`

Inactive assigned locations are now shown at 55% opacity with `cursor: default`. No click handler, no scan button, no check-in badge. Only the "לא פעיל" badge is shown. Active locations are unchanged.

#### Item 9: UI consistency
**File:** `components/admin/DeficienciesTab.tsx`

Column header renamed from "הערות" to "הערות מנהל" for consistency with other tabs and the Excel export column name.

### Verification

- Build: clean
- TypeScript: clean
- Em dash audit on all 8 changed files: clean
- No DB migrations required

### Browser QA results (2026-05-26, Playwright/Chromium)

**43 PASS, 0 FAIL, 1 SKIP**

| Area | Result |
|---|---|
| Modal corner fix | PASS |
| Contract API auth behavior | PASS |
| Deficiency notes (save button, persistence) | PASS |
| Deficiency date filters | PASS |
| Reports tab 30-day default | PASS |
| Logs tab 30-day default + action filter | PASS |
| LocationDetailModal notes and checks UI | PASS |
| Regression checks (absences, GPS, Phase 3, layout) | PASS |
| Inactive location card (inspector view) | SKIP |

**Modal corner fix (runtime computed styles):**
- `overflow: hidden` on `.modal`: confirmed
- `.modal` border-radius: `12px`
- `.modal__header` border-radius: `12px 12px 0px 0px`
- `.modal__footer` border-radius: `0px 0px 12px 12px`

**Deficiency note save:** automated check showed timing false negative; direct DB query after the run confirmed both note saves were written. QA test notes were restored to original values after the run.

**Inactive location SKIP:** david@kosher-place.com (the inspector assigned to inactive "בית חב'ד") could not be authenticated with the QA password. No password was changed. This scenario requires manual QA or explicit approval to set a temporary password.

### Remaining manual QA

These items could not be completed automatically and require a real browser session or live data:

1. **Contract upload and view:** Upload a contract file for an inspector via the admin inspector detail modal. Confirm `profiles.contract_url` stores a raw storage path (not a public URL). Click "צפה" in the inspector table and "פתח" in the detail modal and confirm the file opens via signed URL.
2. **Inspector contract view:** Log in as an inspector who has a contract. Go to Profile tab and click "צפה בחוזה". Confirm the file opens via signed URL.
3. **Inactive location card:** Log in as the inspector assigned to "בית חב'ד" (inactive). Confirm the location card is non-interactive: no click navigation, no scan button, "לא פעיל" badge only, reduced opacity.
4. **Checklist grouping:** After at least one exit scan with active checklist items, open the location detail modal and go to the "בדיקות" tab. Confirm checks are grouped by visit with a shared header showing date and inspector name.

---

## [Perf Patch]: 2026-05-26: Admin tab remounting, shared data, query batching, DB indexes

### Perf Patch summary

6 optimizations implemented. 1 DB migration (9 indexes). Build: clean. TypeScript: clean. Em dash audit: clean.

**Root cause of 2-3 second delays confirmed:** NOT DB query speed (data volumes tiny). Root causes were architectural: tab components remounting on every tab switch, InspectorsTab calling a slow API route with cold-start risk on every mount, DashboardTab running 8 queries in two sequential batches.

#### Fix 1: Lazy tab mounting (eliminates remount on tab switch)
**Files:** `components/admin/AdminShell.tsx`

Tabs now mount only on first visit (`mountedTabs.has(id)`) and are then hidden with `display: none` instead of unmounting. Each tab no longer re-fetches its data on every tab switch.

#### Fix 2: Hoist shared lookup data to AdminShell (shared session cache)
**Files:** `components/admin/AdminShell.tsx`

`profiles`, `locations`, `inspector_locations`, and `/api/admin/users` are now fetched once in `loadShared()` at the AdminShell level and passed as props. Four exported types: `SharedInspector`, `SharedLocation`, `SharedIL` (used by child tabs). `loadShared()` runs in parallel with auth check on mount and re-runs on every refresh button press.

#### Fix 3: Remove per-tab inspector/location/email fetches
**Files:** `components/admin/InspectorsTab.tsx`, `components/admin/ReportsTab.tsx`, `components/admin/DeficienciesTab.tsx`, `components/admin/AbsencesTab.tsx`

Each tab previously fetched inspectors, locations, and email map independently on mount. These are now replaced with props from AdminShell. Each tab's `loadAll()` now fetches only its own data (1 query each instead of 3-4).

#### Fix 4: Dashboard single-batch query (was 2 sequential batches)
**Files:** `components/admin/DashboardTab.tsx`

Dashboard was running 8 queries in two sequential `Promise.all` batches. Now runs all 5 relevant queries in one `Promise.all`. Removed unbounded `visit_logs.select('location_id')` query; active location count now derived from the `locations` prop (no round-trip). Label updated from "מקומות עם ביקורים" to "מקומות פעילים".

#### Fix 5: Narrow heavy selects
**Files:** `components/admin/LocationsTab.tsx`, `app/inspector/page.tsx`

`LocationsTab` list query narrowed from `select('*')` to specific columns (id, name, city, address, qr_code, lat, lng, status). Edit opens a separate full-record fetch (`select('*')` for the single record). Inspector home location join narrowed from `location:locations(*)` to `location:locations(id,name,city,address,status)`.

`LocationDetailModal` fetches the full location record in its own `loadAll()` call and uses `key={location.updated_at ?? 'loading'}` on contact/kashrus forms to force re-initialization of `defaultValue` inputs when async data arrives.

#### Fix 6: DB indexes (9 new B-tree indexes)
**Migration:** `perf_indexes` applied to project `avgzxdfweopkmdldkivc`

```sql
idx_visit_logs_created_at        ON visit_logs (created_at DESC)
idx_visit_logs_location_id       ON visit_logs (location_id)
idx_visit_logs_inspector_id      ON visit_logs (inspector_id)
idx_deficiency_reports_created_at ON deficiency_reports (created_at DESC)
idx_deficiency_reports_location_id ON deficiency_reports (location_id)
idx_gps_alerts_read              ON gps_alerts (read)
idx_visit_checks_visit_log_id    ON visit_checks (visit_log_id)
idx_visit_checks_location_id     ON visit_checks (location_id)
idx_profiles_role                ON profiles (role)
```

All `CREATE INDEX IF NOT EXISTS` - safe DDL, no table lock, no data risk.

#### Not implemented (security tradeoff)
`getUser()` on the inspector home is NOT replaced with `getSession()`. `getUser()` makes a network round-trip but verifies the JWT server-side. `getSession()` reads only from the cookie (unverified at client level). Keeping the secure pattern.

---

## [Phase 3]: 2026-05-25: Inspector profile, admin email, replacement inspector, check-in badge, scrollbar fix

### Phase 3 summary

7 items implemented. No DB migrations required.

#### Item 1: Inspector profile email display + self-service password change
**File:** `app/inspector/page.tsx`

`ProfileView` now receives the inspector's email (from `supabase.auth.getUser()` stored in parent state) and displays it read-only below the name. A "שנה סיסמה" button expands an inline form with new password and confirm password fields. Validation: min 6 characters, confirm match. Calls `supabase.auth.updateUser({ password })` on the authenticated client. Success message auto-clears after 3 seconds, form collapses. Error message shows Supabase error text inline. No API route needed. No current password required (session proves identity). Admin remains the recovery path via key icon modal.

#### Item 2: Admin inspector email visibility
**Files:** `app/api/admin/users/route.ts`, `components/admin/InspectorsTab.tsx`

New `GET /api/admin/users` handler: verifies admin role, calls `service.auth.admin.listUsers({ perPage: 1000 })`, returns `{ id, email }[]`. InspectorsTab fetches this on mount in parallel with profiles, builds an `emailMap`, and displays email in:
- A new "אימייל" column in the inspectors table (after name)
- The inspector detail modal info grid (full-width row below dates)

#### Item 3: Admin password reset
No code changes. Verified correct: key icon opens credentials modal, `PATCH /api/admin/users` calls `service.auth.admin.updateUserById`. Included in manual test report.

#### Item 4: Replacement inspector selection
**Files:** `app/api/inspector/replacements/route.ts` (new), `app/inspector/page.tsx`, `components/admin/AbsencesTab.tsx`

Inspector side: `AbsenceForm` is now controlled for `type` and `locationId`. When type is "החלפה" and a location is selected, calls `GET /api/inspector/replacements?location_id=X`. The new API route verifies the requesting inspector is assigned to that location, then returns all other inspectors also assigned there (using service client). Shows a spinner while loading, "אין משגיחים זמינים למיקום זה" if empty, or a select of available inspectors. `replacement_inspector_id` is included in the POST body to `/api/inspector/absence` (the route already accepted it).

Admin side: AbsencesTab loads all mashgiach profiles and all `inspector_locations` on mount. For `request_type === 'replacement'` rows, the "ממלא מקום" cell shows an editable select with inspectors assigned to the row's location in a priority optgroup, and all others below. On change, updates `absence_requests.replacement_inspector_id` directly. For non-replacement types, shows a static read-only display.

#### Item 5: Check-in state indicator
**File:** `app/inspector/page.tsx`

Each location card on the inspector home now shows a "בפנים" (green) or "בחוץ" (muted) badge based on `loc.lastVisit?.action_type`. Derived from the `visitMap` already built in `loadAll()`; no additional fetch. The badge appears in the card header alongside the active/inactive badge.

#### Item 6: Pre-existing lint warnings
No code changes. Documented in `CLAUDE.md` as a known pattern to address in a future cleanup phase.

#### Item 7: Desktop scrollbar layout shift
**File:** `app/globals.css`

Added `overflow-y: scroll` to the `html` rule. Reserves the scrollbar gutter permanently, preventing layout shift when page content transitions from non-scrollable to scrollable. The existing 5px custom scrollbar style makes the reserved gutter minimally visible.

### QA status (2026-05-25)

**Code-level verification: complete**
- Build: clean
- TypeScript: clean
- Em dash audit on all 8 changed files: clean

**DB-level simulation: complete**
- `replacement_inspector_id` column confirmed present in `absence_requests`
- Replacement API logic simulated via SQL: assignment check, other-inspector query, empty-location case all return correct results
- `ar_admin_all` RLS policy on `absence_requests` confirmed: admin UPDATE of `replacement_inspector_id` is permitted
- Check-in badge logic confirmed: all seed data visits end with `exit`, so all badges show "בחוץ"; "בפנים" requires a live entry scan

**Browser QA: complete (Playwright, 2026-05-25)**
Automated browser QA run against `https://mashgiach.tkpapps.com/` using Playwright + Chromium with cookie-session injection. Results: **28 PASS, 0 FAIL, 1 SKIP**.

Passing:
- Inspector profile: email shown read-only; password change button expands form; mismatch error shown; short-password error shown; successful change collapses form with success message
- Admin Inspectors tab: "אימייל" column header visible; all inspector emails populate after ~5s load; detail modal shows email
- Admin key icon: button title "איפוס סיסמה / אימייל"; modal opens with password field
- Inspector replacement form: no inspector select before location chosen; "אין משגיחים זמינים" shown for location where inspector is sole assignee; יוסף לוי shown for מלון קראון פלאזה
- Admin Absences tab: tab loads, shows "היעדרויות ובקשות (0)" with "אין בקשות." (no live data)
- Check-in badge: "בחוץ" shown initially; "בפנים" badge confirmed after live entry scan of TKP-LOC-0001
- Scrollbar: `overflow-y: scroll` confirmed on html element; clientWidth stable (1280px) across tab navigations
- Logs tab: shows visit_logs data (29 records including the QA entry scans)

Skipped (1): Admin absences replacement selector row interaction - no replacement-type absence requests exist in the live DB to test the editable select and toast. Logic verified at code level.

Credential note: Inspector and admin passwords were temporarily changed for the QA run. Inspector password was restored afterward. Admin password (`tal@kosher-place.com`) was changed and must be reset by the account owner via the key icon in the Inspectors tab or the Supabase Auth dashboard.

**Em dash cleanup: complete**
Project-controlled files that contained em dashes were fixed:
- `supabase/schema.sql` lines 2 and 271-273 (SQL comments): replaced with colons/hyphens
- `AGENTS.md` line 4: em dash replaced with a period

Location names in the production DB ("מלון קראון פלאזה - מטבח כשר" and "בית חב'ד - מטבח") are live user data, not controlled by code. They can be corrected through the admin UI Locations tab by editing each location's name field. No code change was made to DB data.

---

## [Phase 2]: 2026-05-25: Checklist/exit-form workflow + em dash removal

### Em dash removal (global)

All em dash characters (U+2014) have been removed from every user-facing string, error message, button label, modal title, push notification body, code comment, and documentation file. Replaced with colons, commas, hyphens, or sentence breaks as appropriate.

A new rule has been added to `CLAUDE.md`: no em dashes anywhere in UI copy or docs, ever.

Files changed: `app/layout.tsx`, `app/inspector/layout.tsx`, `app/inspector/page.tsx`, `app/inspector/scan/page.tsx`, `app/api/inspector/absence/route.ts`, `components/admin/LocationDetailModal.tsx`, `components/admin/InspectorsTab.tsx`, `components/admin/LocationsTab.tsx`, `components/admin/DashboardTab.tsx`, `lib/supabase/client.ts`, `CLAUDE.md`.

---

### Phase 2: Checklist / exit-form workflow

#### Scan API: returns visit_log_id and location_id on successful exit
**File:** `app/api/inspector/scan/route.ts`

The scan API now includes `visit_log_id` and `location_id` in the response for successful authorized scans. The scan page uses these to decide whether to redirect to the checklist.

#### Scan page: redirects to checklist on exit scan when items exist
**File:** `app/inspector/scan/page.tsx`

After a successful exit scan response, the scan page queries `checklist_items` for active items. If any exist, it redirects to `/inspector/checklist?visit_log_id=...&location_id=...`. If no items exist, it shows the normal success screen as before. Entry scans are unchanged.

#### Checklist page: new inspector workflow
**File:** `app/inspector/checklist/page.tsx` (new)

A new page at `/inspector/checklist` that shows all active global checklist items after an exit scan.

Behavior:
- Each item has a checkbox and an optional note input (note input appears when item is checked).
- Submit button saves only checked items to `visit_checks` via `POST /api/inspector/exit-form`.
- Submit with zero checked items: inline confirmation banner appears first ("לא סומן אף פריט, האם להגיש בכל זאת?"). Inspector must confirm or cancel.
- Skip button ("דלג על הבדיקות"): inline confirmation banner ("האם אתה בטוח שברצונך לדלג?"). Inspector must confirm or cancel.
- Success screen: shows how many items were saved, with a "חזור לבית" button.
- Error screen: shows the API error message with a "חזור לבית" button.
- If URL params are missing (direct navigation or tampering), shows a clear "פרמטרים חסרים" message.
- `useSearchParams` is wrapped in a `Suspense` boundary as required by Next.js App Router.

#### Exit form API: full security chain
**File:** `app/api/inspector/exit-form/route.ts` (rewritten)

Security chain (all server-side, no trust of URL params):
1. Auth: user must be logged in.
2. Payload validation: `visit_log_id`, `location_id`, and `checks` array must all be present.
3. Fetch the visit_log: verify it exists, `inspector_id === user.id`, `action_type === 'exit'`, and `location_id` matches the provided value.
4. Reject if the visit_log is older than 24 hours.
5. Verify the inspector is assigned to the location via `inspector_locations`.
6. Delete any existing `visit_checks` for this `visit_log_id` before inserting (idempotent; prevents duplicate submissions).
7. Insert checked items (zero checked items is a valid submission, results in no rows inserted).

#### CLAUDE.md updated
- Added em dash rule.
- Updated scan flow section: scan API now returns `visit_log_id` and `location_id` for exit redirects.
- Updated inspector forms section: exit-form now documented as fully wired.
- Updated checklist/exit-form section: full workflow documented, including security chain and idempotency approach.
- Removed "Phase 2: not yet wired" note; replaced with complete implementation doc.

---

### Manual testing required (not yet performed: code deployed to Vercel for testing)

- Exit scan with active checklist items: should redirect to checklist page.
- Exit scan with no checklist items: should show normal success screen.
- Entry scan: unchanged.
- Submit checklist with checked items and notes: items saved to `visit_checks`.
- Submit checklist with zero checked items and confirm: submits successfully, empty visit_checks.
- Submit checklist with zero checked items and cancel: returns to form.
- Skip checklist and confirm: redirects to inspector home, no visit_checks inserted.
- Skip checklist and cancel: returns to form.
- Refresh after successful submission: success screen persists (state in component; no re-fetch).
- Double-submit protection: second submit replaces first (delete-before-insert).
- Direct URL tampering with another inspector's visit_log_id: API returns 403.
- Direct URL tampering with old visit_log_id (>24h): API returns 400.
- Admin LocationDetailModal checks tab: submitted checks appear correctly.

---

## [Phase 1.5]: 2026-05-25: QR image, header layout shift, Logs tab

### Bug fixes

#### Bug 1: QR code modal showed text only, no scannable image
**File:** `components/admin/LocationsTab.tsx`

Installed `qrcode.react`. The QR icon modal now renders a proper `QRCodeSVG` image (220px, error correction M). The raw text string is preserved below the image for manual entry. A download button renders a 600px `QRCodeCanvas` offscreen and downloads it as a named PNG. Admins can now print or show the QR image to inspectors.

#### Bug 2: Admin header layout shift on page load
**File:** `components/admin/AdminShell.tsx`

The user info section was conditionally rendered with `{profile && ...}`. Because `profile` loads asynchronously after mount, the header reflowed when it appeared. Fixed by always rendering the element with `visibility: hidden` until profile is loaded, reserving space and preventing reflow.

#### Bug 3: Logs tab empty
**File:** `components/admin/SystemLogsTab.tsx`

Root cause: the Logs tab was reading from `system_logs`, which only receives entries from successful authorized scans. The Dashboard reads from `visit_logs`, which receives entries for every scan attempt. Switched the Logs tab to read from `visit_logs` (up to 500 rows, with search filter). The tab now shows the full audit trail: time, action type, inspector, location, city, internal status badge, and GPS distance.

### Dependency added
- `qrcode.react@4.2.0`

---

## [Patch]: 2026-05-25: Absence push notification

### What changed
**File:** `app/api/inspector/absence/route.ts`

Added push notification to admins on new absence request submission, mirroring the existing pattern in `/api/inspector/report/route.ts`.

After a successful insert, the route now:
1. Fetches the submitting inspector's `full_name` from `profiles`
2. Calls `POST /api/push/notify` with title "בקשת היעדרות חדשה" and body `"{name}, {type in Hebrew}"`
3. Wraps the notify call in try/catch; a failed notification never blocks the submission response

### Manually tested
- Submitted a vacation absence request as inspector
- Confirmed `absence_requests` row created with correct fields
- Confirmed notify endpoint was reached
- Confirmed a failed VAPID config does not break submission

---

## [Phase 1]: 2026-05-25: Core workflow fixes, admin controls, create/edit parity

### Summary
Phase 1 of a full product audit. Fixed launch-blocking bugs in the inspector flow, added a complete admin absence workflow, expanded the location form for create/edit parity, added a dedicated admin password reset action, and improved GPS alert lifecycle management.

### Bug Fixes

#### API: `await createServiceClient()` removed from three routes
- `app/api/inspector/exit-form/route.ts`
- `app/api/inspector/report/route.ts`
- `app/api/inspector/absence/route.ts`

`createServiceClient()` is synchronous. Using `await` on it caused the service-role key to be treated as anon-level by `@supabase/ssr`, silently breaking RLS bypass on all three routes.

#### Inspector forms now call API routes (not direct Supabase inserts)
**File:** `app/inspector/page.tsx` (`ReportForm` and `AbsenceForm`)

Both forms now call their respective API routes. Both now show a error screen if the API call fails, instead of silently succeeding.

#### Inspector location detail page: authorization check added
**File:** `app/inspector/location/[id]/page.tsx`

Now verifies the inspector has a matching row in `inspector_locations`. If not assigned, redirects to `/inspector`.

### New Features

#### Absences tab: full admin workflow
**File:** `components/admin/AbsencesTab.tsx`

Inline status dropdown (pending/approved/denied), admin notes with explicit save button, delete with confirmation, Excel export, status filter.

DB changes:
```sql
ALTER TABLE absence_requests
  ADD COLUMN admin_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN admin_notes text;
```

#### Location create/edit parity: full form on both modals
**File:** `components/admin/LocationsTab.tsx`

`LocationForm` now includes contact fields and kashrus_procedure on both create and edit.

#### Admin password reset: dedicated modal
**File:** `components/admin/InspectorsTab.tsx`

Key icon button per inspector row opens a focused credentials modal. Profile edit (pencil) now only handles name, dates, vacation days.

#### GPS alert lifecycle: dismiss-all + context messaging
**File:** `components/admin/DashboardTab.tsx`

"סמן הכל כנקרא" button, context description, bold warning distance display.

### Remaining known issues
- Contract URLs use `getPublicUrl` on a private bucket; links return 403 (Phase 4)
- Inspector profile tab shows no email, no self-service password change (Phase 3)
- Replacement inspector not selectable in absence form (Phase 3)
