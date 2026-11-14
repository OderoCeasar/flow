-- name: GetCluster :one
SELECT id, utility_id,
       ST_Y(centroid::geometry)::float8 AS lat, ST_X(centroid::geometry)::float8 AS lng,
       report_count, primary_report_id, status, created_at
FROM clusters WHERE id = $1;

-- name: CreateClusterForReport :one
-- A new group holding one report, which becomes its primary.
INSERT INTO clusters (utility_id, centroid, report_count, primary_report_id, created_at, updated_at)
SELECT utility_id, location, 1, id, created_at, created_at FROM reports WHERE reports.id = @report_id
RETURNING id;

-- name: MoveReportsToCluster :exec
UPDATE reports SET cluster_id = @cluster_id::uuid, suggested_cluster_id = NULL, updated_at = now()
WHERE id = ANY(@report_ids::uuid[]);

-- name: RefreshCluster :exec
-- Recount members, move the centre, and close the group once nothing in it is open.
UPDATE clusters c SET
    report_count = sub.n,
    centroid     = COALESCE(sub.centroid, c.centroid),
    status       = CASE WHEN c.status = 'merged' THEN 'merged'
                        WHEN sub.n_open = 0 THEN 'closed' ELSE 'open' END,
    updated_at   = now()
FROM (
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE r.status NOT IN ('fixed', 'invalid'))::int AS n_open,
           ST_Centroid(ST_Collect(r.location::geometry))::geography AS centroid
    FROM reports r WHERE r.cluster_id = @cluster_id
) sub
WHERE c.id = @cluster_id;

-- name: SetClusterPrimary :exec
UPDATE clusters SET primary_report_id = @report_id, updated_at = now() WHERE id = @cluster_id;

-- name: MarkClusterMerged :exec
UPDATE clusters SET status = 'merged', report_count = 0, primary_report_id = NULL, updated_at = now()
WHERE id = $1;

-- name: ClearSuggestionsForCluster :exec
UPDATE reports SET suggested_cluster_id = NULL WHERE suggested_cluster_id = @cluster_id::uuid;

-- name: ListNearbyOpenClusters :many
-- Open groups whose centre is within the radius, active since the cutoff, with
-- a matching leak type. An unknown leak type on either side matches anything.
SELECT c.id AS cluster_id,
       p.id AS primary_report_id,
       p.reference_code,
       p.leak_type,
       p.status,
       c.report_count,
       ST_Distance(c.centroid, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography)::float8 AS distance_m,
       p.created_at
FROM clusters c
JOIN reports p ON p.id = c.primary_report_id
WHERE c.status = 'open'
  AND p.status NOT IN ('fixed', 'invalid')
  AND ST_DWithin(c.centroid, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography, @radius_m::float8)
  AND c.updated_at >= @since
  AND (sqlc.narg(leak_type)::text IS NULL OR p.leak_type IS NULL OR p.leak_type = sqlc.narg(leak_type))
  AND (sqlc.narg(exclude_cluster_id)::uuid IS NULL OR c.id <> sqlc.narg(exclude_cluster_id))
  AND (sqlc.narg(utility_id)::uuid IS NULL OR c.utility_id = sqlc.narg(utility_id))
ORDER BY distance_m
LIMIT @max_results;
