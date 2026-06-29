-- ============================================================
-- Mashgiach App: Full Database Schema
-- Run this in Supabase SQL Editor after creating your project
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------
-- PROFILES (extends auth.users)
-- -------------------------------------------------------
CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'mashgiach')),
  start_date    date,
  vacation_days_remaining int DEFAULT 0,
  contract_url  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Auto-create profile on sign up (admin must create users, so this is just a safety net)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'mashgiach')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -------------------------------------------------------
-- LOCATIONS / RESTAURANTS
-- -------------------------------------------------------
CREATE TABLE locations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       text NOT NULL,
  city                       text,
  address                    text,
  qr_code                    text UNIQUE NOT NULL,
  lat                        decimal(10,7),
  lng                        decimal(10,7),
  status                     text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  contact_name               text,
  contact_phone              text,
  contact_email              text,
  contact_notes              text,
  kashrus_procedure          text,
  kashrus_procedure_file_url text,
  kashrus_certificate_url    text,
  opening_hours              text,   -- work & kashrut procedure
  inspector_arrival_time     text,   -- work & kashrut procedure
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- INSPECTOR ↔ LOCATION ASSIGNMENTS
-- -------------------------------------------------------
CREATE TABLE inspector_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (inspector_id, location_id)
);

-- -------------------------------------------------------
-- VISIT LOGS (entry + exit)
-- -------------------------------------------------------
CREATE TABLE visit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id     uuid NOT NULL REFERENCES profiles(id),
  location_id      uuid REFERENCES locations(id),
  action_type      text NOT NULL CHECK (action_type IN ('entry', 'exit')),
  device_lat       decimal(10,7),
  device_lng       decimal(10,7),
  device_accuracy_m double precision,
  manual_correction boolean NOT NULL DEFAULT false,   -- created by an approved scan correction
  distance_meters  int,
  internal_status  text NOT NULL CHECK (internal_status IN ('success','unauthorized','invalid_location','gps_mismatch','error')),
  qr_code_scanned  text,
  created_at       timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- CHECKLIST ITEMS (admin-editable)
-- -------------------------------------------------------
CREATE TABLE checklist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  active      boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  -- NULL location_id = the global default list, used as a fallback for any
  -- location that has no items of its own.
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  frequency   text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly')),
  procedure_note text,   -- per-check guidance shown in the work & kashrut procedure
  created_at  timestamptz DEFAULT now()
);

-- Default items
INSERT INTO checklist_items (name, sort_order) VALUES
  ('הדלקת גז', 1),
  ('הדלקת מוצרי חשמל', 2),
  ('הפרשת חלה', 3),
  ('מעקב אחרי שטיפות עלים: כרוב וחסה', 4),
  ('סלרי', 5),
  ('בדיקת חצילים', 6),
  ('בדיקת אורז', 7),
  ('בדיקת בצל ושום עם שמן', 8),
  ('בדיקת מקררים', 9),
  ('בדיקת חומרי גלם', 10),
  ('בדיקת ניקיון מחסנים ואזורי עבודה', 11);

-- -------------------------------------------------------
-- VISIT CHECKS (submitted on exit)
-- -------------------------------------------------------
CREATE TABLE visit_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_log_id       uuid NOT NULL REFERENCES visit_logs(id) ON DELETE CASCADE,
  inspector_id       uuid NOT NULL REFERENCES profiles(id),
  location_id        uuid REFERENCES locations(id),
  checklist_item_id  uuid REFERENCES checklist_items(id),
  item_name          text,
  note               text,
  frequency          text,
  created_at         timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- DEFICIENCY REPORTS
-- -------------------------------------------------------
CREATE TABLE deficiency_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id  uuid NOT NULL REFERENCES profiles(id),
  location_id   uuid NOT NULL REFERENCES locations(id),
  report_type   text NOT NULL CHECK (report_type IN ('deficiency', 'note')),
  description   text NOT NULL,
  admin_status  text DEFAULT 'open' CHECK (admin_status IN ('open', 'in_progress', 'resolved')),
  admin_notes   text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- ABSENCE / VACATION / REPLACEMENT REQUESTS
-- -------------------------------------------------------
CREATE TABLE absence_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id              uuid NOT NULL REFERENCES profiles(id),
  request_type              text NOT NULL CHECK (request_type IN ('vacation','absence','replacement','other')),
  start_date                date,
  end_date                  date,
  location_id               uuid REFERENCES locations(id),
  replacement_inspector_id  uuid REFERENCES profiles(id),
  notes                     text,
  created_at                timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- SYSTEM LOGS (audit trail)
-- -------------------------------------------------------
CREATE TABLE system_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   text NOT NULL,
  performed_by  uuid REFERENCES profiles(id),
  location_id   uuid REFERENCES locations(id),
  details       jsonb DEFAULT '{}',
  status        text,
  created_at    timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- GPS ALERTS
-- -------------------------------------------------------
CREATE TABLE gps_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_log_id     uuid REFERENCES visit_logs(id),
  inspector_id     uuid REFERENCES profiles(id),
  location_id      uuid REFERENCES locations(id),
  action_type      text,
  distance_meters  int,
  read             boolean DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- PUSH SUBSCRIPTIONS
-- -------------------------------------------------------
CREATE TABLE push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- -------------------------------------------------------
-- DOCUMENTS (standalone contracts/documents library)
-- -------------------------------------------------------
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_type    text NOT NULL CHECK (file_type IN ('image','document')),
  location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  inspector_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_by  uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- PROCEDURE PHOTOS (oven/appliance photos for the work & kashrut procedure)
-- -------------------------------------------------------
CREATE TABLE procedure_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  photo_path  text NOT NULL,
  note        text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- SCAN CORRECTIONS (inspector "forgot to scan out" requests)
-- On approval, apply_scan_correction() creates the entry+exit visit_logs at the
-- estimated times (flagged visit_logs.manual_correction = true).
-- -------------------------------------------------------
CREATE TABLE scan_corrections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_id  uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- missed_checkout: entry already exists, only est_exit is given (est_entry NULL).
  -- missing_visit: both estimated times are given.
  correction_type text NOT NULL DEFAULT 'missing_visit' CHECK (correction_type IN ('missed_checkout','missing_visit')),
  est_entry    timestamptz,
  est_exit     timestamptz NOT NULL,
  note         text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  admin_notes  text,
  reviewed_by  uuid REFERENCES profiles(id),
  reviewed_at  timestamptz,
  entry_log_id uuid REFERENCES visit_logs(id),
  exit_log_id  uuid REFERENCES visit_logs(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- REPORT SETTINGS (single-row config for the daily manager email report)
-- -------------------------------------------------------
CREATE TABLE report_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled        boolean NOT NULL DEFAULT false,
  send_time      text NOT NULL DEFAULT '10:00',          -- HH:MM, Asia/Bangkok
  recipients     text[] NOT NULL DEFAULT '{}',
  sections       text[] NOT NULL DEFAULT '{time_per_restaurant,deficiencies,checklist_details}',
  last_sent_date date,                                    -- Bangkok date of last send; idempotency guard
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- ROW LEVEL SECURITY
-- -------------------------------------------------------
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspector_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_checks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deficiency_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;
-- documents: RLS on with no policies; all access is via the admin service-role route.
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
-- procedure_photos: RLS on with no policies; access via service-role routes only.
ALTER TABLE procedure_photos    ENABLE ROW LEVEL SECURITY;
-- report_settings: RLS on with no policies; all access is via the admin/cron service-role routes.
ALTER TABLE report_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_corrections    ENABLE ROW LEVEL SECURITY;

-- Helper: is current user admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Profiles: admin sees all, mashgiach sees own
CREATE POLICY "profiles_admin_all"    ON profiles FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "profiles_self_select"  ON profiles FOR SELECT TO authenticated USING (id = auth.uid());

-- Locations: admin full, mashgiach reads assigned
CREATE POLICY "locations_admin_all"   ON locations FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "locations_mashgiach"   ON locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM inspector_locations WHERE inspector_id = auth.uid() AND location_id = locations.id));

-- Inspector locations
CREATE POLICY "il_admin_all"          ON inspector_locations FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "il_self_select"        ON inspector_locations FOR SELECT TO authenticated USING (inspector_id = auth.uid());

-- Visit logs
CREATE POLICY "vl_admin_all"          ON visit_logs FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "vl_self_insert"        ON visit_logs FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "vl_self_select"        ON visit_logs FOR SELECT TO authenticated USING (inspector_id = auth.uid());

-- Checklist items: admin manages, mashgiach reads active
CREATE POLICY "ci_admin_all"          ON checklist_items FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "ci_mashgiach_read"     ON checklist_items FOR SELECT TO authenticated USING (active = true);

-- Visit checks
CREATE POLICY "vc_admin_all"          ON visit_checks FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "vc_self_insert"        ON visit_checks FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "vc_self_select"        ON visit_checks FOR SELECT TO authenticated USING (inspector_id = auth.uid());

-- Deficiency reports
CREATE POLICY "dr_admin_all"          ON deficiency_reports FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "dr_self_insert"        ON deficiency_reports FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "dr_self_select"        ON deficiency_reports FOR SELECT TO authenticated USING (inspector_id = auth.uid());

-- Absence requests
CREATE POLICY "ar_admin_all"          ON absence_requests FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "ar_self_insert"        ON absence_requests FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "ar_self_select"        ON absence_requests FOR SELECT TO authenticated USING (inspector_id = auth.uid());

-- System logs: admin only
CREATE POLICY "sl_admin_all"          ON system_logs FOR ALL TO authenticated USING (is_admin());

-- GPS alerts: admin only
CREATE POLICY "ga_admin_all"          ON gps_alerts FOR ALL TO authenticated USING (is_admin());

-- Push subscriptions: own
CREATE POLICY "ps_self_all"           ON push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid());

-- scan_corrections: admins manage all; inspectors create and read their own.
-- Approval runs through apply_scan_correction() (security definer, in a migration).
CREATE POLICY "sc_admin_all"          ON scan_corrections FOR ALL    TO authenticated USING (is_admin());
CREATE POLICY "sc_self_insert"        ON scan_corrections FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "sc_self_select"        ON scan_corrections FOR SELECT TO authenticated USING (inspector_id = auth.uid());

-- -------------------------------------------------------
-- STORAGE BUCKETS (run in Supabase Dashboard > Storage)
-- -------------------------------------------------------
-- Create these buckets manually or via Supabase CLI:
--   "contracts"          (private) - inspector contracts
--   "certificates"       (private) - kashrus certificates
--   "kashrus-procedures" (private) - kashrus procedure files
--   "admin-reports"      (private) - admin location report attachments
--   "documents"          (private) - standalone documents/contracts library
--   "procedure-photos"   (private) - oven/appliance photos for procedures
