-- name: ListUtilities :many
SELECT id, name, ST_AsGeoJSON(service_area)::jsonb AS service_area, created_at FROM utilities ORDER BY name;

-- name: GetUtility :one
SELECT id, name, ST_AsGeoJSON(service_area)::jsonb AS service_area, created_at FROM utilities WHERE id = $1;

-- name: CreateUtility :one
-- The area is GeoJSON, either a Polygon or a MultiPolygon.
INSERT INTO utilities (name, service_area)
VALUES (@name, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(@area_geojson::text), 4326)))
RETURNING id;

-- name: UpdateUtility :execrows
UPDATE utilities SET
    name         = COALESCE(sqlc.narg(name), name),
    service_area = COALESCE(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(sqlc.narg(area_geojson)::text), 4326)), service_area),
    updated_at   = now()
WHERE id = @id;

-- name: DeleteUtility :execrows
DELETE FROM utilities WHERE id = $1;

-- name: CountUtilities :one
SELECT count(*) FROM utilities;

-- name: CreateZone :exec
INSERT INTO zones (utility_id, name, center)
VALUES (@utility_id, @name, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography);

-- name: ListZones :many
SELECT id, utility_id, name, ST_Y(center::geometry)::float8 AS lat, ST_X(center::geometry)::float8 AS lng
FROM zones
WHERE sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id)
ORDER BY name;

-- name: ListSensitiveSites :many
SELECT id, utility_id, name, kind, ST_Y(location::geometry)::float8 AS lat, ST_X(location::geometry)::float8 AS lng
FROM sensitive_sites
WHERE sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id) OR utility_id IS NULL
ORDER BY kind, name;

-- name: CreateSensitiveSite :one
INSERT INTO sensitive_sites (utility_id, name, kind, location)
VALUES (sqlc.narg(utility_id), @name, @kind, ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography)
RETURNING id;

-- name: UpdateSensitiveSite :execrows
UPDATE sensitive_sites SET
    name     = @name,
    kind     = @kind,
    location = ST_SetSRID(ST_MakePoint(@lng::float8, @lat::float8), 4326)::geography
WHERE id = @id;

-- name: DeleteSensitiveSite :execrows
DELETE FROM sensitive_sites WHERE id = $1;

-- name: GetPrioritySettings :one
SELECT weights FROM priority_settings WHERE utility_id = $1;

-- name: SavePrioritySettings :exec
INSERT INTO priority_settings (utility_id, weights, updated_by, updated_at)
VALUES (@utility_id, @weights, sqlc.narg(updated_by), now())
ON CONFLICT (utility_id) DO UPDATE
SET weights = EXCLUDED.weights, updated_by = EXCLUDED.updated_by, updated_at = now();
