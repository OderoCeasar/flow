-- name: GetReport :one
SELECT * FROM report_view WHERE id = $1;

-- name: GetReportByRef :one
SELECT * FROM report_view WHERE reference_code = upper(@reference_code::text);

-- name: ListReportsInCluster :many
SELECT * FROM report_view WHERE cluster_id = @cluster_id::uuid ORDER BY created_at;

-- name: ListReportsForReporter :many
SELECT * FROM report_view
WHERE reporter_id = @user_id::uuid OR (@phone::text <> '' AND reporter_phone = @phone)
ORDER BY created_at DESC
LIMIT 100;

-- name: CreateReport :one
INSERT INTO reports (
    reference_code, reporter_id, reporter_phone, locale, location, address_text,
    description, leak_type, size_estimate, duration, utility_id, zone_id, created_at, updated_at
) VALUES (
    @reference_code, sqlc.narg(reporter_id), sqlc.narg(reporter_phone), @locale,
    ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography,
    @address_text, @description, sqlc.narg(leak_type), sqlc.narg(size_estimate), sqlc.narg(duration),
    sqlc.narg(utility_id),
    -- The report's zone is the one whose centre is nearest.
    (SELECT z.id FROM zones z
     WHERE z.utility_id = sqlc.narg(utility_id)
     ORDER BY z.center <-> ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography
     LIMIT 1),
    COALESCE(sqlc.narg(created_at)::timestamptz, now()), COALESCE(sqlc.narg(created_at)::timestamptz, now())
)
RETURNING id;

-- name: GetUtilityForPoint :one
SELECT id FROM utilities
WHERE ST_Contains(service_area, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326))
ORDER BY created_at
LIMIT 1;

-- name: SetReportAnalysis :exec
-- Results of the background AI pass. Only fills leak type and size when the
-- citizen left them empty.
UPDATE reports SET
    leak_type     = COALESCE(leak_type, sqlc.narg(leak_type)),
    size_estimate = COALESCE(size_estimate, sqlc.narg(size_estimate)),
    is_main       = @is_main,
    ai_text       = sqlc.narg(ai_text),
    needs_review  = @needs_review,
    review_reason = @review_reason,
    analyzed_at   = now(),
    updated_at    = now()
WHERE id = @id;

-- name: SetReportAutoSeverity :exec
-- Leaves a dispatcher's severity alone.
UPDATE reports SET severity = @severity, updated_at = now()
WHERE id = @id AND severity_source = 'auto';

-- name: SetReportSeverityOverride :exec
UPDATE reports SET
    severity        = @severity,
    severity_source = 'dispatcher',
    severity_reason = @severity_reason,
    updated_at      = now()
WHERE id = @id;

-- name: SetReportPriority :exec
UPDATE reports SET priority_score = @priority_score, priority_breakdown = @priority_breakdown, updated_at = now()
WHERE id = @id;

-- name: SetReportPriorityOverride :exec
-- A null override clears it.
UPDATE reports SET
    priority_override        = sqlc.narg(priority_override),
    priority_override_reason = @priority_override_reason,
    updated_at               = now()
WHERE id = @id;

-- name: SetReportDetails :exec
-- Dispatcher corrections to what the citizen or the AI said.
UPDATE reports SET
    leak_type     = COALESCE(sqlc.narg(leak_type), leak_type),
    size_estimate = COALESCE(sqlc.narg(size_estimate), size_estimate),
    is_main       = COALESCE(sqlc.narg(is_main), is_main),
    needs_review  = COALESCE(sqlc.narg(needs_review), needs_review),
    updated_at    = now()
WHERE id = @id;

-- name: SetReportStatus :exec
UPDATE reports SET
    status         = @status,
    fixed_at       = sqlc.narg(fixed_at),
    invalid_reason = @invalid_reason,
    updated_at     = now()
WHERE id = @id;

-- name: SetReportSuggestedCluster :exec
UPDATE reports SET suggested_cluster_id = sqlc.narg(suggested_cluster_id), updated_at = now()
WHERE id = @id;

-- name: CountPrimaryReports :one
SELECT count(*) FROM report_view
WHERE is_primary
  AND (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
  AND (sqlc.narg(statuses)::text[] IS NULL OR status = ANY(sqlc.narg(statuses)::text[]))
  AND (sqlc.narg(severities)::text[] IS NULL OR severity = ANY(sqlc.narg(severities)::text[]))
  AND (sqlc.narg(leak_types)::text[] IS NULL OR leak_type = ANY(sqlc.narg(leak_types)::text[]))
  AND (sqlc.narg(zone_ids)::uuid[] IS NULL OR zone_id = ANY(sqlc.narg(zone_ids)::uuid[]))
  AND (sqlc.narg(created_from)::timestamptz IS NULL OR created_at >= sqlc.narg(created_from))
  AND (sqlc.narg(created_to)::timestamptz IS NULL OR created_at < sqlc.narg(created_to))
  AND (NOT @needs_review_only::bool OR needs_review)
  AND (@query::text = '' OR reference_code ILIKE '%' || @query || '%'
       OR address_text ILIKE '%' || @query || '%' OR description ILIKE '%' || @query || '%')
  AND (sqlc.narg(min_lng)::float8 IS NULL
       OR (lng BETWEEN sqlc.narg(min_lng) AND sqlc.narg(max_lng)::float8
           AND lat BETWEEN sqlc.narg(min_lat)::float8 AND sqlc.narg(max_lat)::float8));

-- name: ListPrimaryReports :many
-- One row per group of duplicates (its primary report), filtered and sorted
-- for the dispatcher dashboard. Keep the filters in step with CountPrimaryReports.
SELECT * FROM report_view
WHERE is_primary
  AND (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
  AND (sqlc.narg(statuses)::text[] IS NULL OR status = ANY(sqlc.narg(statuses)::text[]))
  AND (sqlc.narg(severities)::text[] IS NULL OR severity = ANY(sqlc.narg(severities)::text[]))
  AND (sqlc.narg(leak_types)::text[] IS NULL OR leak_type = ANY(sqlc.narg(leak_types)::text[]))
  AND (sqlc.narg(zone_ids)::uuid[] IS NULL OR zone_id = ANY(sqlc.narg(zone_ids)::uuid[]))
  AND (sqlc.narg(created_from)::timestamptz IS NULL OR created_at >= sqlc.narg(created_from))
  AND (sqlc.narg(created_to)::timestamptz IS NULL OR created_at < sqlc.narg(created_to))
  AND (NOT @needs_review_only::bool OR needs_review)
  AND (@query::text = '' OR reference_code ILIKE '%' || @query || '%'
       OR address_text ILIKE '%' || @query || '%' OR description ILIKE '%' || @query || '%')
  AND (sqlc.narg(min_lng)::float8 IS NULL
       OR (lng BETWEEN sqlc.narg(min_lng) AND sqlc.narg(max_lng)::float8
           AND lat BETWEEN sqlc.narg(min_lat)::float8 AND sqlc.narg(max_lat)::float8))
ORDER BY
    CASE WHEN @sort::text = 'newest' THEN created_at END DESC,
    CASE WHEN @sort::text = 'oldest' THEN created_at END ASC,
    CASE WHEN @sort::text = 'severity' THEN severity_rank END ASC,
    priority_score DESC,
    created_at ASC
LIMIT @page_limit OFFSET @page_offset;

-- name: ListOpenPrimaryReportIDs :many
SELECT id FROM report_view WHERE is_primary AND status NOT IN ('fixed', 'invalid');

-- name: GetNearestSensitiveSite :one
SELECT name, kind,
       ST_Distance(location, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography)::float8 AS distance_m
FROM sensitive_sites
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography, @max_m::float8)
ORDER BY distance_m
LIMIT 1;

-- name: ListJobsForTechnician :many
SELECT * FROM report_view
WHERE assignee_id = @technician_id::uuid
  AND (CASE WHEN @include_done::bool THEN status <> 'invalid'
            ELSE status IN ('verified', 'scheduled', 'in_progress') END)
ORDER BY (status = 'fixed'), priority_score DESC, assignee_due_at NULLS LAST;

-- name: CreateStatusEvent :exec
INSERT INTO status_events (report_id, from_status, to_status, actor_id, note, created_at)
VALUES (@report_id, sqlc.narg(from_status), @to_status, sqlc.narg(actor_id), @note, COALESCE(sqlc.narg(created_at)::timestamptz, now()));

-- name: ListStatusEvents :many
SELECT e.id, e.report_id, e.from_status, e.to_status, e.actor_id, COALESCE(u.name, '') AS actor_name, e.note, e.created_at
FROM status_events e
LEFT JOIN users u ON u.id = e.actor_id
WHERE e.report_id = $1
ORDER BY e.created_at, e.id;

-- name: CreateAuditEntry :exec
INSERT INTO report_audit (report_id, actor_id, action, details) VALUES (@report_id, sqlc.narg(actor_id), @action, @details);

-- name: ListAuditEntries :many
SELECT a.id, a.report_id, a.actor_id, COALESCE(u.name, '') AS actor_name, a.action, a.details, a.created_at
FROM report_audit a
LEFT JOIN users u ON u.id = a.actor_id
WHERE a.report_id = $1
ORDER BY a.created_at, a.id;

-- name: CreatePhoto :one
INSERT INTO report_photos (report_id, storage_key, kind, content_type, size_bytes, uploaded_by)
VALUES (@report_id, @storage_key, @kind, @content_type, @size_bytes, sqlc.narg(uploaded_by))
RETURNING *;

-- name: ListPhotosForReports :many
SELECT * FROM report_photos WHERE report_id = ANY(@report_ids::uuid[]) ORDER BY created_at;

-- name: SetPhotoLabels :exec
UPDATE report_photos SET ai_labels = $2 WHERE id = $1;

-- name: DeactivateAssignments :exec
UPDATE assignments SET active = false WHERE report_id = $1 AND active;

-- name: CreateAssignment :one
INSERT INTO assignments (report_id, technician_id, assigned_by, due_at)
VALUES (@report_id, @technician_id, sqlc.narg(assigned_by), sqlc.narg(due_at))
RETURNING *;

-- name: GetActiveAssignment :one
SELECT * FROM assignments WHERE report_id = $1 AND active;

-- name: SetCitizenFeedback :exec
UPDATE reports SET citizen_feedback = @feedback, citizen_feedback_at = now(), updated_at = now()
WHERE id = @id;

-- name: FlagReportForReview :exec
UPDATE reports SET needs_review = true, review_reason = @review_reason, updated_at = now()
WHERE id = @id;

-- name: ListOpenAssignedReports :many
-- Every open job that has a technician, for the crews page.
SELECT * FROM report_view
WHERE assignee_id IS NOT NULL
  AND status IN ('verified', 'scheduled', 'in_progress')
  AND (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
ORDER BY priority_score DESC;
