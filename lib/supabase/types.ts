export type Role = 'admin' | 'mashgiach'
export type LocationStatus = 'active' | 'inactive'
export type ActionType = 'entry' | 'exit'
export type VisitStatus = 'success' | 'unauthorized' | 'invalid_location' | 'gps_mismatch' | 'error'
export type ReportType = 'deficiency' | 'note'
export type AdminStatus = 'open' | 'in_progress' | 'resolved'
export type RequestType = 'vacation' | 'absence' | 'replacement' | 'other'

export type Profile = {
  id: string
  full_name: string
  role: Role
  start_date: string | null
  vacation_days_remaining: number
  contract_url: string | null
  created_at: string
  updated_at: string
}

export type Location = {
  id: string
  name: string
  city: string | null
  address: string | null
  qr_code: string
  lat: number | null
  lng: number | null
  status: LocationStatus
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_notes: string | null
  kashrus_procedure: string | null
  kashrus_procedure_file_url: string | null
  kashrus_certificate_url: string | null
  created_at: string
  updated_at: string
}

export type InspectorLocation = {
  id: string
  inspector_id: string
  location_id: string
  created_at: string
}

export type VisitLog = {
  id: string
  inspector_id: string
  location_id: string | null
  action_type: ActionType
  device_lat: number | null
  device_lng: number | null
  device_accuracy_m: number | null
  distance_meters: number | null
  internal_status: VisitStatus
  qr_code_scanned: string | null
  created_at: string
  inspector?: Pick<Profile, 'id' | 'full_name'>
  location?: Pick<Location, 'id' | 'name' | 'city'>
}

export type ChecklistFrequency = 'daily' | 'weekly'

export type ChecklistItem = {
  id: string
  name: string
  active: boolean
  sort_order: number
  location_id: string | null
  frequency: ChecklistFrequency
  created_at: string
}

export type VisitCheck = {
  id: string
  visit_log_id: string
  inspector_id: string
  location_id: string | null
  checklist_item_id: string | null
  item_name: string | null
  note: string | null
  frequency: ChecklistFrequency | null
  created_at: string
  inspector?: Pick<Profile, 'id' | 'full_name'>
  location?: Pick<Location, 'id' | 'name' | 'city'>
  checklist_item?: Pick<ChecklistItem, 'id' | 'name'>
}

export type DeficiencyReport = {
  id: string
  inspector_id: string
  location_id: string
  report_type: ReportType
  description: string
  admin_status: AdminStatus
  admin_notes: string | null
  created_at: string
  updated_at: string
  inspector?: Pick<Profile, 'id' | 'full_name'>
  location?: Pick<Location, 'id' | 'name' | 'city'>
}

export type AbsenceAdminStatus = 'pending' | 'approved' | 'denied'

export type AbsenceRequest = {
  id: string
  inspector_id: string
  request_type: RequestType
  start_date: string | null
  end_date: string | null
  location_id: string | null
  replacement_inspector_id: string | null
  notes: string | null
  admin_status: AbsenceAdminStatus
  admin_notes: string | null
  days_deducted: number
  created_at: string
  inspector?: Pick<Profile, 'id' | 'full_name'>
  location?: Pick<Location, 'id' | 'name'>
  replacement_inspector?: Pick<Profile, 'id' | 'full_name'>
}

export type SystemLog = {
  id: string
  action_type: string
  performed_by: string | null
  location_id: string | null
  details: Record<string, unknown>
  status: string | null
  created_at: string
  performer?: Pick<Profile, 'id' | 'full_name'>
  location?: Pick<Location, 'id' | 'name'>
}

export type ReportPhoto = {
  id: string
  report_id: string
  inspector_id: string
  photo_path: string
  created_at: string
}

export type VisitPhoto = {
  id: string
  visit_log_id: string
  inspector_id: string
  location_id: string | null
  photo_path: string
  created_at: string
}

export type AdminLocationReport = {
  id: string
  location_id: string
  admin_id: string
  title: string
  body: string | null
  visit_date: string
  created_at: string
  updated_at: string
  location?: Pick<Location, 'id' | 'name' | 'city' | 'address'>
  admin?: Pick<Profile, 'id' | 'full_name'>
}

export type AdminReportAttachment = {
  id: string
  report_id: string
  admin_id: string
  file_path: string
  file_name: string
  file_type: 'image' | 'document'
  created_at: string
}

export type AdminReportFollowup = {
  id: string
  report_id: string
  text: string
  completed: boolean
  completed_at: string | null
  created_at: string
}

export type Document = {
  id: string
  name: string
  file_path: string
  file_name: string
  file_type: 'image' | 'document'
  location_id: string | null
  inspector_id: string | null
  uploaded_by: string | null
  created_at: string
}

export type GpsAlert = {
  id: string
  visit_log_id: string | null
  inspector_id: string | null
  location_id: string | null
  action_type: string | null
  distance_meters: number | null
  read: boolean
  created_at: string
  inspector?: Pick<Profile, 'id' | 'full_name'>
  location?: Pick<Location, 'id' | 'name' | 'city'>
  visit_log?: Pick<VisitLog, 'device_lat' | 'device_lng'> | null
}

export type ReportSection = 'summary' | 'time_per_restaurant' | 'deficiencies' | 'checklist_details'

export type ReportSettings = {
  id: string
  enabled: boolean
  send_time: string            // HH:MM, Asia/Bangkok
  recipients: string[]
  sections: ReportSection[]
  last_sent_date: string | null
  updated_at: string
}

type TableDef<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles:            TableDef<Profile, Omit<Profile,'created_at'|'updated_at'|'vacation_days_remaining'|'start_date'|'contract_url'> & { vacation_days_remaining?: number; start_date?: string | null; contract_url?: string | null }, Partial<Profile>>
      locations:           TableDef<Location, Omit<Location,'id'|'created_at'|'updated_at'> & { id?: string }, Partial<Location>>
      inspector_locations: TableDef<InspectorLocation, Omit<InspectorLocation,'id'|'created_at'>, Partial<InspectorLocation>>
      visit_logs:          TableDef<VisitLog, Omit<VisitLog,'id'|'created_at'|'inspector'|'location'>, Partial<Omit<VisitLog,'inspector'|'location'>>>
      checklist_items:     TableDef<ChecklistItem, Omit<ChecklistItem,'id'|'created_at'|'location_id'|'frequency'> & { id?: string; location_id?: string | null; frequency?: ChecklistFrequency }, Partial<ChecklistItem>>
      visit_checks:        TableDef<VisitCheck, Omit<VisitCheck,'id'|'created_at'|'frequency'|'inspector'|'location'|'checklist_item'> & { frequency?: ChecklistFrequency | null }, Partial<Omit<VisitCheck,'inspector'|'location'|'checklist_item'>>>
      deficiency_reports:  TableDef<DeficiencyReport, Omit<DeficiencyReport,'id'|'created_at'|'updated_at'|'inspector'|'location'>, Partial<Omit<DeficiencyReport,'inspector'|'location'>>>
      absence_requests:    TableDef<AbsenceRequest, Omit<AbsenceRequest,'id'|'created_at'|'admin_status'|'admin_notes'|'days_deducted'|'inspector'|'location'|'replacement_inspector'> & { admin_status?: AbsenceAdminStatus; admin_notes?: string | null }, Partial<Omit<AbsenceRequest,'inspector'|'location'|'replacement_inspector'>>>
      system_logs:         TableDef<SystemLog, Omit<SystemLog,'id'|'created_at'|'performer'|'location'>, Partial<Omit<SystemLog,'performer'|'location'>>>
      gps_alerts:          TableDef<GpsAlert, Omit<GpsAlert,'id'|'created_at'|'inspector'|'location'>, Partial<Omit<GpsAlert,'inspector'|'location'>>>
      visit_photos:              TableDef<VisitPhoto, Omit<VisitPhoto,'id'|'created_at'>, Partial<VisitPhoto>>
      report_photos:             TableDef<ReportPhoto, Omit<ReportPhoto,'id'|'created_at'>, Partial<ReportPhoto>>
      admin_location_reports:    TableDef<AdminLocationReport, Omit<AdminLocationReport,'id'|'created_at'|'updated_at'|'location'|'admin'>, Partial<Omit<AdminLocationReport,'location'|'admin'>>>
      admin_report_attachments:  TableDef<AdminReportAttachment, Omit<AdminReportAttachment,'id'|'created_at'>, Partial<AdminReportAttachment>>
      admin_report_followups:    TableDef<AdminReportFollowup, Omit<AdminReportFollowup,'id'|'created_at'>, Partial<AdminReportFollowup>>
      push_subscriptions:        TableDef<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string }, { user_id: string; endpoint: string; p256dh: string; auth: string }, { user_id?: string; endpoint?: string; p256dh?: string; auth?: string }>
      documents:                 TableDef<Document, Omit<Document,'id'|'created_at'>, Partial<Document>>
      report_settings:           TableDef<ReportSettings, Partial<Omit<ReportSettings,'id'|'updated_at'>>, Partial<Omit<ReportSettings,'id'>>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
