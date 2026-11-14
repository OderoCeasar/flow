// Package dbtest starts a throwaway PostGIS container for integration tests.
package dbtest

import (
	"context"
	"errors"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

const image = "postgis/postgis:16-3.4"

// Start runs PostGIS, applies the migrations and returns a pool. The container
// is removed when the test (or TestMain caller) cleans up.
func Start(ctx context.Context) (*pgxpool.Pool, func(), error) {
	container, err := postgres.Run(ctx, image,
		postgres.WithDatabase("flow"), postgres.WithUsername("flow"), postgres.WithPassword("flow"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		return nil, nil, err
	}
	stop := func() { _ = testcontainers.TerminateContainer(container) }
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		stop()
		return nil, nil, err
	}
	_, file, _, _ := runtime.Caller(0)
	migrations := "file://" + filepath.Join(filepath.Dir(file), "..", "migrations")
	m, err := migrate.New(migrations, "pgx5"+dsn[len("postgres"):])
	if err != nil {
		stop()
		return nil, nil, err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		stop()
		return nil, nil, err
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		stop()
		return nil, nil, err
	}
	return pool, func() { pool.Close(); stop() }, nil
}

// Truncate empties every table between tests.
func Truncate(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := pool.Exec(ctx, `TRUNCATE jobs, priority_settings, sensitive_sites, assignments, report_audit,
		status_events, report_photos, reports, clusters, otp_codes, refresh_tokens, users, zones, utilities CASCADE`)
	if err != nil {
		t.Fatal(err)
	}
}
