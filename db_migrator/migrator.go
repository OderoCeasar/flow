package db_migrator

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"flow/config"
)

// RunDBMigration applies every pending migration in config.MigrationURL.
func RunDBMigration(cfg config.Config) error {
	slog.Info("running migrations", "url", cfg.MigrationURL)

	migration, err := migrate.New(cfg.MigrationURL, cfg.MigrateDBSource())
	if err != nil {
		return fmt.Errorf("cannot create migrate instance: %w", err)
	}
	defer migration.Close()

	if err = migration.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}

	slog.Info("db migrated successfully")
	return nil
}
