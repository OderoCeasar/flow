package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"flow/account"
	"flow/admin"
	"flow/ai"
	"flow/api"
	"flow/config"
	db "flow/db/sqlc"
	"flow/db_migrator"
	"flow/geocode"
	"flow/report"
	"flow/seed"
	"flow/sms"
	"flow/storage"
	"flow/token"
	"flow/workers"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	appConfig, err := config.LoadConfig(".")
	if err != nil {
		fatal("load config", err)
	}
	conPool, err := newPool(ctx, appConfig.DBSource)
	if err != nil {
		fatal("connect to database", err)
	}
	// The PostGIS image restarts once after first-time setup, so retry.
	if err := retry(ctx, 15, func() error { return db_migrator.RunDBMigration(appConfig) }); err != nil {
		fatal("run migrations", err)
	}
	defer conPool.Close()
	store := db.NewStore(conPool)

	photos, err := storage.NewS3Store(appConfig)
	if err != nil {
		fatal("create photo store", err)
	}
	if err := retry(ctx, 10, func() error { return photos.EnsureBucket(ctx) }); err != nil {
		fatal("create photo bucket", err)
	}

	tokenMaker, err := token.NewJWTMaker(appConfig.TokenSymmetricKey)
	if err != nil {
		fatal("create token maker", err)
	}
	taskDistributor := workers.NewPGTaskDistributor(store)
	smsSender := sms.NewSmsSender(appConfig)
	reports := report.NewService(store, photos, taskDistributor, report.Classifiers{})

	if appConfig.SeedDemo {
		// The seed analyzes reports inline, so it gets the keyword text classifier.
		seeder := report.NewService(store, photos, taskDistributor, report.Classifiers{Text: ai.KeywordText{}})
		if err := seed.Seed(ctx, store, seeder); err != nil {
			fatal("seed demo data", err)
		}
	}

	server := api.NewServer(appConfig, store, tokenMaker,
		account.NewService(store, tokenMaker, smsSender, appConfig),
		reports,
		admin.NewService(store, taskDistributor),
		newGeocoder(appConfig))

	httpServer := &http.Server{
		Addr:              appConfig.HTTPServerAddress,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second, // photo uploads on slow networks
		WriteTimeout:      60 * time.Second,
	}
	go func() {
		slog.Info("Flow API listening", "addr", appConfig.HTTPServerAddress, "env", appConfig.Environment)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fatal("http server", err)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

func newGeocoder(cfg config.Config) geocode.Reverser {
	if cfg.Geocoder == "off" {
		return geocode.Off{}
	}
	return geocode.NewNominatim(cfg.NominatimURL, "Flow/0.1 (water leak reporting; https://github.com/OderoCeasar/flow)", cfg.GeocoderEmail)
}

func newPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute
	cfg.HealthCheckPeriod = time.Minute
	var pool *pgxpool.Pool
	err = retry(ctx, 10, func() error {
		var err error
		if pool, err = pgxpool.NewWithConfig(ctx, cfg); err != nil {
			return err
		}
		return pool.Ping(ctx)
	})
	return pool, err
}

// retry gives dependencies started alongside us (Postgres, MinIO) time to come up.
func retry(ctx context.Context, attempts int, fn func() error) error {
	var err error
	for i := 0; i < attempts; i++ {
		if err = fn(); err == nil {
			return nil
		}
		slog.Warn("waiting for dependency", "attempt", i+1, "err", err)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return err
}

func fatal(msg string, err error) {
	slog.Error(msg, "err", err)
	os.Exit(1)
}
