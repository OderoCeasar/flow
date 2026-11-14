-- name: EnqueueJob :exec
-- Skips the insert when an identical job is already waiting.
INSERT INTO jobs (type, payload, run_after)
SELECT @type::text, @payload::jsonb, @run_after::timestamptz
WHERE NOT EXISTS (
    SELECT 1 FROM jobs j WHERE j.type = @type::text AND j.payload = @payload::jsonb AND j.status = 'queued'
);

-- name: ClaimJob :one
-- Takes the next ready job. SKIP LOCKED lets several workers share the table.
UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
WHERE id = (
    SELECT j.id FROM jobs j
    WHERE j.status = 'queued' AND j.run_after <= now()
    ORDER BY j.run_after, j.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING id, type, payload, attempts, max_attempts;

-- name: CompleteJob :exec
UPDATE jobs SET status = 'done', locked_at = NULL, updated_at = now() WHERE id = $1;

-- name: RetryJob :exec
UPDATE jobs SET status = 'queued', last_error = @last_error, run_after = @run_after, locked_at = NULL, updated_at = now()
WHERE id = @id;

-- name: FailJob :exec
UPDATE jobs SET status = 'failed', last_error = @last_error, locked_at = NULL, updated_at = now() WHERE id = @id;

-- name: RequeueStaleJobs :execrows
-- Puts back jobs whose worker died mid-run.
UPDATE jobs SET status = 'queued', locked_at = NULL, updated_at = now()
WHERE status = 'running' AND locked_at < now() - make_interval(secs => @older_than_secs::float8);

-- name: PruneJobs :exec
DELETE FROM jobs WHERE status = 'done' AND updated_at < now() - make_interval(secs => @older_than_secs::float8);
