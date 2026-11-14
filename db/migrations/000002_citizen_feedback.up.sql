-- The reporter's answer to "Was it fixed properly?" once a leak is marked Fixed.
ALTER TABLE reports
    ADD COLUMN citizen_feedback    text CHECK (citizen_feedback IN ('fixed', 'not_fixed')),
    ADD COLUMN citizen_feedback_at timestamptz;

-- New columns go at the end so the view can be replaced in place.
CREATE OR REPLACE VIEW report_view AS
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
       COALESCE(array_position(ARRAY['critical', 'high', 'medium', 'low'], r.severity), 5)::int AS severity_rank,
       r.citizen_feedback,
       r.citizen_feedback_at
FROM reports r
LEFT JOIN zones z ON z.id = r.zone_id
LEFT JOIN clusters c ON c.id = r.cluster_id
LEFT JOIN assignments a ON a.report_id = r.id AND a.active
LEFT JOIN users tu ON tu.id = a.technician_id;
