export type Status = 'received' | 'verified' | 'scheduled' | 'in_progress' | 'fixed' | 'invalid';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type LeakType = 'burst_pipe' | 'pooling' | 'dripping' | 'sewage' | 'other';
export type Size = 'small' | 'medium' | 'large';
export type Duration = 'today' | 'days' | 'week';
export type Role = 'citizen' | 'dispatcher' | 'technician' | 'admin';

export const STATUSES: Status[] = ['received', 'verified', 'scheduled', 'in_progress', 'fixed', 'invalid'];
export const TIMELINE: Status[] = ['received', 'verified', 'scheduled', 'in_progress', 'fixed'];
export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
export const LEAK_TYPES: LeakType[] = ['burst_pipe', 'pooling', 'dripping', 'sewage', 'other'];

export interface User {
  id: string;
  role: Role;
  name: string;
  phone?: string;
  email?: string;
  utility_id?: string;
}

export interface PriorityItem {
  key: string;
  label: string;
  points: number;
  params?: Record<string, string | number>;
}

export interface Report {
  id: string;
  reference_code: string;
  lat: number;
  lng: number;
  address_text: string;
  description: string;
  leak_type: LeakType | null;
  size_estimate: Size | null;
  duration: Duration | null;
  is_main: boolean;
  status: Status;
  severity: Severity | null;
  severity_source: 'auto' | 'dispatcher';
  severity_reason: string;
  priority_score: number;
  priority_breakdown: PriorityItem[];
  priority_override: number | null;
  priority_override_reason: string;
  ai_text: { leak_type?: string; size?: string; confidence: number; model: string } | null;
  needs_review: boolean;
  review_reason: string;
  invalid_reason: string;
  cluster_id: string | null;
  suggested_cluster_id: string | null;
  zone_id: string | null;
  zone_name: string;
  duplicate_count: number;
  is_primary: boolean;
  assignee_id: string | null;
  assignee_name: string;
  assignee_due_at: string | null;
  has_reporter_phone: boolean;
  fixed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AILabels {
  top: { label: string; confidence: number };
  labels: { label: string; confidence: number }[];
  reason?: string;
  model: string;
}

export interface Photo {
  id: string;
  report_id: string;
  kind: 'before' | 'after';
  url: string;
  ai_labels: AILabels | null;
  created_at: string;
}

export interface StatusEvent {
  id: number;
  from_status: Status | null;
  to_status: Status;
  actor_name: string;
  note: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  actor_name: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ReportDetail {
  report: Report;
  members: Report[];
  photos: Photo[];
  events: StatusEvent[];
  audit: AuditEntry[];
  suggestion: { cluster_id: string; reference_code: string; leak_type: LeakType | null; report_count: number; distance_m: number } | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PublicStatus {
  reference_code: string;
  status: Status;
  leak_type: LeakType | null;
  area_name: string;
  address_text: string;
  others_reported: number;
  invalid_reason?: string;
  typical_fix_hours: number;
  events: { status: Status; note?: string; created_at: string }[];
  created_at: string;
  updated_at: string;
}

export interface NearbyMatch {
  cluster_id: string;
  reference_code: string;
  leak_type: LeakType | null;
  status: Status;
  report_count: number;
  distance_m: number;
  created_at: string;
}

export interface CreateReportResult {
  reference_code: string;
  status: Status;
  joined_existing: boolean;
  typical_fix_hours: number;
  sms_updates: boolean;
}

export interface Job extends Report {
  photos: Photo[];
}

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Stats {
  open_leaks: number;
  critical_open: number;
  needs_review: number;
  reports_this_week: number;
  fixed_this_week: number;
  avg_hours_to_fix: number;
  fixed_last_90_days: number;
  water_lost_litres_90d: number;
  water_loss_rate_lpd: number;
  per_zone: { zone_id: string | null; zone_name: string; reports: number; open: number }[];
}

export interface Settings {
  weights: { severity: number; duplicates: number; age: number; sensitive_site: number; water_loss: number; main_pipe: number };
  params: {
    sensitive_radius_m: number;
    duplicate_cap: number;
    age_cap_hours: number;
    water_loss_cap_lpd: number;
    duplicate_radius_m: number;
    duplicate_window_days: number;
    review_confidence: number;
  };
}
