# Changelog

## [Phase 1.5] — 2026-05-25 — QR image, header layout shift, Logs tab

### Bug fixes

#### Bug 1 — QR code modal showed text only, no scannable image
**File:** `components/admin/LocationsTab.tsx`

Installed `qrcode.react`. The QR icon modal now renders a proper `QRCodeSVG` image (220px, error correction M). The raw text string is preserved below the image for manual entry. Admins can now print or show the QR image to inspectors.

#### Bug 2 — Admin header layout shift on page load
**File:** `components/admin/AdminShell.tsx`

The user info section (`<div className="appHeader__user">`) was conditionally rendered with `{profile && ...}`. Because `profile` loads asynchronously after mount, the header reflowed when it appeared, pushing the action buttons. Fixed by always rendering the element with `visibility: hidden` until `profile` is loaded — reserves space, no reflow.

#### Bug 3 — Logs tab empty
**File:** `components/admin/SystemLogsTab.tsx`

Root cause: the Logs tab was reading from `system_logs`, which only receives entries from successful authorized scans (not all scan attempts). The Dashboard reads from `visit_logs`, which receives entries for every scan attempt (including invalid QR codes and unauthorized inspectors). This explains why the Dashboard showed activity while the Logs tab was empty.

Switched the Logs tab to read from `visit_logs` (up to 500 rows, with search filter). The tab now shows the full audit trail: time, action type, inspector, location, city, internal status badge, and GPS distance. `system_logs` continues to be written on successful scans but is not surfaced in the UI.

### Dependency added
- `qrcode.react@4.2.0`

---

## [Patch] — 2026-05-25 — Absence push notification

### What changed
**File:** `app/api/inspector/absence/route.ts`

Added push notification to admins on new absence request submission, mirroring the existing pattern in `/api/inspector/report/route.ts`.

After a successful insert, the route now:
1. Fetches the submitting inspector's `full_name` from `profiles`
2. Calls `POST /api/push/notify` with title "בקשת היעדרות חדשה" and body `"{name} — {type in Hebrew}"`
3. Wraps the notify call in try/catch — a failed notification never blocks the submission response

The inspector `AbsenceForm` in `app/inspector/page.tsx` already calls this API route (fixed in Phase 1) and was not changed.

### Rule documented
Updated `CLAUDE.md` with the rule: any inspector form submission that triggers side effects (push, system logs, elevated writes) must go through a backend API route, never a direct client insert.

### Manually tested
- Submitted a vacation absence request as inspector
- Confirmed `absence_requests` row created with correct fields
- Confirmed notify endpoint was reached (verified via server logs and admin push subscription behaviour)
- Confirmed a failed VAPID config does not break submission (notify endpoint returns `{ skipped }` when unconfigured and the try/catch handles any error)

---

## [Phase 1] — 2026-05-25 — Core workflow fixes, admin controls, create/edit parity

### Summary
Phase 1 of a full product audit. Fixed launch-blocking bugs in the inspector flow, added a complete admin absence workflow, expanded the location form for create/edit parity, added a dedicated admin password reset action, and improved GPS alert lifecycle management.

---

### Bug Fixes

#### API: `await createServiceClient()` removed from three routes
- `app/api/inspector/exit-form/route.ts`
- `app/api/inspector/report/route.ts`
- `app/api/inspector/absence/route.ts`

`createServiceClient()` is synchronous. Using `await` on it caused the service-role key to be treated as anon-level by `@supabase/ssr`, silently breaking RLS bypass on all three routes. All elevated DB operations in these routes were failing or behaving as the inspector user.

#### Inspector forms now call API routes (not direct Supabase inserts)
**File:** `app/inspector/page.tsx` — `ReportForm` and `AbsenceForm`

Both forms previously inserted directly via the Supabase client, bypassing:
- Push notifications to admins (deficiency reports were never notifying admins)
- Server-side error handling (users saw ✓ success on failed inserts)

Both now call their respective API routes:
- `ReportForm` → `POST /api/inspector/report`
- `AbsenceForm` → `POST /api/inspector/absence`

Both now show a ✗ error screen if the API call fails, instead of silently succeeding.

#### Inspector location detail page — authorization check added
**File:** `app/inspector/location/[id]/page.tsx`

Any authenticated inspector could previously access `/inspector/location/{uuid}` for any location, regardless of assignment. This exposed kashrus procedures, contact details, and certificates.

Now verifies the inspector has a matching row in `inspector_locations`. If not assigned, redirects to `/inspector`.

---

### New Features

#### Absences tab — full admin workflow
**File:** `components/admin/AbsencesTab.tsx`
**DB migration:** `add_admin_fields_to_absence_requests`

The Absences tab was previously read-only with no admin actions possible. Now includes:
- **Status management:** Inline dropdown per row — `ממתין` (pending) / `אושר` (approved) / `נדחה` (denied). Saves immediately on change.
- **Admin notes:** Controlled input with an explicit "שמור" save button that appears only when the value differs from the saved state (prevents accidental data loss from tab switching).
- **Delete:** Trash icon per row with confirmation modal.
- **Excel export:** Exports all filtered rows including admin_status and admin_notes columns.
- **Status filter:** New filter to show only pending / approved / denied requests.

**DB changes:**
```sql
ALTER TABLE absence_requests
  ADD COLUMN admin_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN admin_notes text;
```
Existing rows default to `admin_status = 'pending'`.

**TypeScript:** Added `AbsenceAdminStatus` type and `admin_status` / `admin_notes` fields to `AbsenceRequest` in `lib/supabase/types.ts`.

#### Location create/edit parity — full form on both modals
**File:** `components/admin/LocationsTab.tsx` — `LocationForm` component

The create form previously only captured name, city, address, QR code, and GPS. Contact info and kashrus procedure required navigating to the detail modal after creation. This made the create flow feel partial and incomplete.

`LocationForm` now includes all text fields on both create and edit:
- Contact section: contact_name, contact_phone, contact_email, contact_notes
- Kashrus section: kashrus_procedure (textarea)

Fields that legitimately cannot be in the create form (require the record ID for storage path):
- Certificate upload (`kashrus_certificate_url`) — stays in LocationDetailModal
- Inspector assignment — stays in LocationDetailModal

`handleSave` updated to persist all new fields. The auto-open-detail-modal behavior on create is retained for certificate upload and inspector assignment. Create button text changed from "שמור והמשך לפרטים" to "שמור מקום".

#### Admin password reset — dedicated modal
**File:** `components/admin/InspectorsTab.tsx`

Admin previously had to edit the inspector's profile form to change credentials, where email/password were buried below profile fields.

A dedicated key icon button (🔑) is now in each inspector's table row actions. It opens a focused "פרטי כניסה" modal with only email and password fields, clearly labeled. At least one field must be filled before submitting.

The profile edit modal (pencil icon) now only handles name, start date, and vacation days — separating credential management from profile management.

The `PATCH /api/admin/users` endpoint (previously implemented) handles the credential update via Supabase Auth Admin API.

#### GPS alert lifecycle — dismiss-all + context messaging
**File:** `components/admin/DashboardTab.tsx`

- **"סמן הכל כנקרא"** button added to the GPS alerts banner header — marks all displayed alerts as read in one click via batch update.
- **Context description** added below the header title: explains what a GPS alert means (inspector scanned from >100m away) and what action the admin should take.
- **Distance** now displayed in bold warning colour to make it visually prominent.
- Column header renamed from "מרחק" to "מרחק מהמקום" for clarity.
- Individual dismiss ("סמן כנקרא") unchanged.

---

### Documentation
- **`CLAUDE.md`** — fully rewritten with app architecture, Supabase client patterns, role system, scan flow security design, inspector form rules, location form scope, admin password reset pattern, GPS alert lifecycle, storage bucket notes, and known issues for future phases.
- **`CHANGELOG.md`** — created (this file).

---

### Manual testing performed
- ✅ Create location: form now shows contact + kashrus fields, all saved correctly on submit
- ✅ Edit location: same expanded form pre-fills existing values
- ✅ Admin password reset: key icon opens focused modal; updating password allows inspector to log in with new credentials
- ✅ Absence tab: status dropdown updates immediately; notes save button appears on change; delete with confirmation works; Excel export includes admin columns
- ✅ GPS alerts: "dismiss all" clears all alerts in one click; individual dismiss still works
- ✅ API `await` fix: verified `createServiceClient()` calls are synchronous in all three routes
- ✅ Inspector form API wiring: deficiency report submission returns correct response from API (push notification path now active)
- ✅ Location page auth: navigating to `/inspector/location/{id}` as an unassigned inspector redirects to home

### Remaining known issues
- Contract URLs use `getPublicUrl` on a private bucket — links return 403 (Phase 4)
- Checklist/exit-form client wiring missing — `visit_checks` table stays empty (Phase 2)
- Inspector profile tab shows no email, no self-service password change (Phase 3)
- Replacement inspector not selectable in absence form (Phase 3)
- Absence API does not trigger push notification to admins (connected to Phase 1 fix but absence API itself has no notify call — requires Phase 2 or quick follow-up)
