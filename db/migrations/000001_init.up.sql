CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE utilities (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    service_area geometry(MultiPolygon, 4326) NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX utilities_service_area_gix ON utilities USING GIST (service_area);

-- Named zones inside a utility (Nairobi sub-counties). A report belongs to
-- the zone whose centre is closest, so zones never leave gaps.
CREATE TABLE zones (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utility_id uuid NOT NULL REFERENCES utilities(id) ON DELETE CASCADE,
    name       text NOT NULL,
    center     geography(Point, 4326) NOT NULL
);
CREATE INDEX zones_center_gix ON zones USING GIST (center);

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role          text NOT NULL CHECK (role IN ('citizen', 'dispatcher', 'technician', 'admin')),
    name          text NOT NULL DEFAULT '',
    phone         text UNIQUE,
    email         text UNIQUE,
    password_hash text,
    utility_id    uuid REFERENCES utilities(id) ON DELETE SET NULL,
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       text NOT NULL,
    code_hash   text NOT NULL,
    attempts    int NOT NULL DEFAULT 0,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE clusters (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utility_id        uuid REFERENCES utilities(id) ON DELETE CASCADE,
    centroid          geography(Point, 4326) NOT NULL,
    report_count      int NOT NULL DEFAULT 1,
    primary_report_id uuid,
    status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'merged')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clusters_centroid_gix ON clusters USING GIST (centroid);

CREATE TABLE reports (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_code           text NOT NULL UNIQUE,
    reporter_id              uuid REFERENCES users(id) ON DELETE SET NULL,
    reporter_phone           text,
    locale                   text NOT NULL DEFAULT 'en',
    location                 geography(Point, 4326) NOT NULL,
    address_text             text NOT NULL DEFAULT '',
    description              text NOT NULL DEFAULT '',
    leak_type                text CHECK (leak_type IN ('burst_pipe', 'pooling', 'dripping', 'sewage', 'other')),
    size_estimate            text CHECK (size_estimate IN ('small', 'medium', 'large')),
    duration                 text CHECK (duration IN ('today', 'days', 'week')),
    is_main                  boolean NOT NULL DEFAULT false,
    status                   text NOT NULL DEFAULT 'received'
                             CHECK (status IN ('received', 'verified', 'scheduled', 'in_progress', 'fixed', 'invalid')),
    severity                 text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    severity_source          text NOT NULL DEFAULT 'auto' CHECK (severity_source IN ('auto', 'dispatcher')),
    severity_reason          text NOT NULL DEFAULT '',
    priority_score           int NOT NULL DEFAULT 0,
    priority_breakdown       jsonb NOT NULL DEFAULT '[]',
    priority_override        int CHECK (priority_override BETWEEN 0 AND 100),
    priority_override_reason text NOT NULL DEFAULT '',
    ai_text                  jsonb,
    needs_review             boolean NOT NULL DEFAULT false,
    review_reason            text NOT NULL DEFAULT '',
    invalid_reason           text NOT NULL DEFAULT '',
    cluster_id               uuid REFERENCES clusters(id),
    suggested_cluster_id     uuid REFERENCES clusters(id) ON DELETE SET NULL,
    utility_id               uuid REFERENCES utilities(id),
    zone_id                  uuid REFERENCES zones(id) ON DELETE SET NULL,
    analyzed_at              timestamptz,
    fixed_at                 timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_location_gix ON reports USING GIST (location);
CREATE INDEX reports_utility_status_idx ON reports (utility_id, status);
CREATE INDEX reports_cluster_idx ON reports (cluster_id);
CREATE INDEX reports_reporter_idx ON reports (reporter_id);
CREATE INDEX reports_reporter_phone_idx ON reports (reporter_phone);
CREATE INDEX reports_priority_idx ON reports (priority_score DESC);

ALTER TABLE clusters
    ADD CONSTRAINT clusters_primary_report_fk FOREIGN KEY (primary_report_id) REFERENCES reports(id) ON DELETE SET NULL;

CREATE TABLE report_photos (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id    uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    storage_key  text NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('before', 'after')),
    content_type text NOT NULL DEFAULT 'image/jpeg',
    size_bytes   int NOT NULL DEFAULT 0,
    ai_labels    jsonb,
    uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_photos_report_idx ON report_photos (report_id);

-- Full status history. Rows are only ever inserted.
CREATE TABLE status_events (
    id          bigserial PRIMARY KEY,
    report_id   uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    from_status text,
    to_status   text NOT NULL,
    actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
    note        text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX status_events_report_idx ON status_events (report_id, created_at);

-- Other dispatcher decisions (overrides, merges, splits), also append-only.
CREATE TABLE report_audit (
    id         bigserial PRIMARY KEY,
    report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
    action     text NOT NULL,
    details    jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_audit_report_idx ON report_audit (report_id, created_at);

CREATE TABLE assignments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    technician_id uuid NOT NULL REFERENCES users(id),
    assigned_by   uuid REFERENCES users(id) ON DELETE SET NULL,
    due_at        timestamptz,
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assignments_one_active_idx ON assignments (report_id) WHERE active;
CREATE INDEX assignments_technician_idx ON assignments (technician_id) WHERE active;

CREATE TABLE sensitive_sites (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utility_id uuid REFERENCES utilities(id) ON DELETE CASCADE,
    name       text NOT NULL,
    kind       text NOT NULL CHECK (kind IN ('hospital', 'school', 'clinic', 'market', 'other')),
    location   geography(Point, 4326) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sensitive_sites_location_gix ON sensitive_sites USING GIST (location);

CREATE TABLE priority_settings (
    utility_id uuid PRIMARY KEY REFERENCES utilities(id) ON DELETE CASCADE,
    weights    jsonb NOT NULL,
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
    id           bigserial PRIMARY KEY,
    type         text NOT NULL,
    payload      jsonb NOT NULL DEFAULT '{}',
    status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
    attempts     int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 5,
    last_error   text NOT NULL DEFAULT '',
    run_after    timestamptz NOT NULL DEFAULT now(),
    locked_at    timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs (run_after) WHERE status = 'queued';

-- One row per report with everything the screens need (coordinates, zone,
-- duplicate count, assignee). All report reads go through this view so sqlc
-- generates a single ReportView type.
CREATE VIEW report_view AS
SELECT r.id,
       r.reference_code,
       r.reporter_id,
       r.reporter_phone,
       r.locale,
       ST_Y(r.location::geometry)::float8                               AS lat,
       ST_X(r.location::geometry)::float8                               AS lng,
       r.address_text,
       r.description,
       r.leak_type,
       r.size_estimate,
       r.duration,
       r.is_main,
       r.status,
       r.severity,
       r.severity_source,
       r.severity_reason,
       r.priority_score,
       r.priority_breakdown,
       r.priority_override,
       r.priority_override_reason,
       r.ai_text,
       r.needs_review,
       r.review_reason,
       r.invalid_reason,
       r.cluster_id,
       r.suggested_cluster_id,
       r.utility_id,
       r.zone_id,
       COALESCE(z.name, '')                                             AS zone_name,
       r.analyzed_at,
       r.fixed_at,
       r.created_at,
       r.updated_at,
       GREATEST(COALESCE(c.report_count, 1) - 1, 0)::int                AS duplicate_count,
       COALESCE(c.primary_report_id = r.id, true)::bool                 AS is_primary,
       a.technician_id                                                  AS assignee_id,
       COALESCE(tu.name, '')                                            AS assignee_name,
       a.due_at                                                         AS assignee_due_at,
       COALESCE(array_position(ARRAY['critical', 'high', 'medium', 'low'], r.severity), 5)::int AS severity_rank
FROM reports r
LEFT JOIN zones z ON z.id = r.zone_id
LEFT JOIN clusters c ON c.id = r.cluster_id
LEFT JOIN assignments a ON a.report_id = r.id AND a.active
LEFT JOIN users tu ON tu.id = a.technician_id;
