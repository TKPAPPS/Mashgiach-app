# Changelog

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
