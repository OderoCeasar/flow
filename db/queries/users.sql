-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE lower(email) = lower(@email::text);

-- name: GetUserByPhone :one
SELECT * FROM users WHERE phone = $1;

-- name: CreateUser :one
INSERT INTO users (role, name, phone, email, password_hash, utility_id)
VALUES (@role, @name, sqlc.narg(phone), lower(sqlc.narg(email)), sqlc.narg(password_hash), sqlc.narg(utility_id))
RETURNING *;

-- name: UpdateUser :one
UPDATE users SET
    name          = COALESCE(sqlc.narg(name), name),
    role          = COALESCE(sqlc.narg(role), role),
    utility_id    = COALESCE(sqlc.narg(utility_id), utility_id),
    active        = COALESCE(sqlc.narg(active), active),
    password_hash = COALESCE(sqlc.narg(password_hash), password_hash)
WHERE id = @id
RETURNING *;

-- name: ListStaff :many
-- Every non-citizen account, optionally narrowed to one utility and role.
SELECT * FROM users
WHERE role <> 'citizen'
  AND (sqlc.narg(utility_id)::uuid IS NULL OR utility_id = sqlc.narg(utility_id))
  AND (@role::text = '' OR role = @role)
ORDER BY role, name;

-- name: LinkReportsToUser :exec
-- Attach reports made anonymously with this phone number to the account.
UPDATE reports SET reporter_id = @user_id
WHERE reporter_phone = @phone AND reporter_id IS NULL;

-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3);

-- name: UseRefreshToken :one
-- Each refresh token works once: using it revokes it.
UPDATE refresh_tokens SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
RETURNING user_id;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL;

-- name: CreateOTP :exec
INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, $3);

-- name: GetLatestOTP :one
SELECT * FROM otp_codes
WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
ORDER BY created_at DESC LIMIT 1;

-- name: BumpOTPAttempts :exec
UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1;

-- name: ConsumeOTP :exec
UPDATE otp_codes SET consumed_at = now() WHERE id = $1;
