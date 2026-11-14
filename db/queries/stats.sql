-- name: GetStatsSummary :one
SELECT
    count(*) FILTER (WHERE is_primary AND status NOT IN ('fixed', 'invalid'))::int                         AS open_leaks,
    count(*) FILTER (WHERE is_primary AND status NOT IN ('fixed', 'invalid') AND severity = 'critical')::int AS critical_open,
    count(*) FILTER (WHERE is_primary AND status NOT IN ('fixed', 'invalid') AND needs_review)::int         AS needs_review,
    count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int                                    AS reports_this_week,
    count(*) FILTER (WHERE is_primary AND fixed_at >= now() - interval '7 days')::int                       AS fixed_this_week,
    COALESCE(avg(EXTRACT(EPOCH FROM fixed_at - created_at) / 3600)
        FILTER (WHERE is_primary AND fixed_at >= now() - interval '90 days'), 0)::float8                    AS avg_hours_to_fix,
    count(*) FILTER (WHERE is_primary AND fixed_at >= now() - interval '90 days')::int                      AS fixed_last_90_days,
    count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int                                     AS reports_today,
    count(*) FILTER (WHERE is_primary AND fixed_at >= now() - interval '14 days'
                       AND fixed_at < now() - interval '7 days')::int                                       AS fixed_previous_week,
    COALESCE(avg(EXTRACT(EPOCH FROM fixed_at - created_at) / 3600)
        FILTER (WHERE is_primary AND fixed_at >= now() - interval '30 days'), 0)::float8                    AS avg_hours_to_fix_30d,
    COALESCE(avg(EXTRACT(EPOCH FROM fixed_at - created_at) / 3600)
        FILTER (WHERE is_primary AND fixed_at >= now() - interval '60 days'
                  AND fixed_at < now() - interval '30 days'), 0)::float8                                    AS avg_hours_to_fix_prev_30d
FROM report_view
WHERE sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id);

-- name: ListReportsPerZone :many
SELECT zone_id,
       (CASE WHEN zone_name = '' THEN 'Unknown area' ELSE zone_name END)::text AS zone_name,
       count(*)::int                                                      AS reports,
       count(*) FILTER (WHERE status NOT IN ('fixed', 'invalid'))::int    AS open
FROM report_view
WHERE (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
  AND created_at >= @since
GROUP BY zone_id, zone_name
ORDER BY reports DESC;

-- name: ListLossRows :many
-- Primary, valid reports active since the cutoff, for the water-lost estimate.
SELECT leak_type, size_estimate, created_at, fixed_at
FROM report_view
WHERE (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
  AND is_primary
  AND status <> 'invalid'
  AND (fixed_at IS NULL OR fixed_at >= @since::timestamptz);

-- name: GetTypicalFixHours :one
-- Median hours from report to fix over the last 90 days.
SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM fixed_at - created_at) / 3600), 0)::float8 AS hours,
       count(*)::int AS samples
FROM reports
WHERE fixed_at >= now() - interval '90 days'
  AND (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
  AND (sqlc.narg(severity)::text IS NULL OR severity = sqlc.narg(severity));
