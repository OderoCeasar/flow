// Command worker runs background jobs from the Postgres jobs table: AI
// analysis, priority scoring (on change and hourly) and SMS updates.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"flow/ai"
	"flow/config"
	db "flow/db/sqlc"
	"flow/report"
	"flow/sms"
	"flow/storage"
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
	pool, err := pgxpool.New(ctx, appConfig.DBSource)
	if err != nil {
		fatal("connect to database", err)
	}
	defer pool.Close()
	for i := 0; i < 15; i++ {
		if err = pool.Ping(ctx); err == nil {
			break
		}
		slog.Warn("waiting for database", "err", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		fatal("ping database", err)
	}
	store := db.NewStore(pool)

	photos, err := storage.NewS3Store(appConfig)
	if err != nil {
		fatal("create photo store", err)
	}
	distributor := workers.NewPGTaskDistributor(store)
	reports := report.NewService(store, photos, distributor, classifiers(appConfig))
	processor := workers.NewPGTaskProcessor(store, distributor, reports, sms.NewSmsSender(appConfig),
		appConfig.WorkerConcurrency, appConfig.RescoreInterval)
	if err := processor.Start(ctx); err != nil {
		fatal("worker", err)
	}
}

// classifiers builds the AI pieces named in config. Each can be swapped or
// turned off without touching the rest of the system.
func classifiers(cfg config.Config) report.Classifiers {
	var c report.Classifiers
	var claude *ai.Claude
	if cfg.AnthropicAPIKey != "" {
		claude = ai.NewClaude(cfg.AnthropicAPIKey, cfg.AnthropicModel)
	}
	switch cfg.AIImageClassifier {
	case "claude":
		if claude == nil {
			slog.Warn("AI_IMAGE_CLASSIFIER=claude but ANTHROPIC_API_KEY is empty; using stub")
			c.Image = ai.StubImage{}
		} else {
			c.Image = claude
		}
	case "off":
		c.Image = ai.Off{}
	default:
		c.Image = ai.StubImage{}
	}
	switch cfg.AITextClassifier {
	case "claude":
		if claude == nil {
			slog.Warn("AI_TEXT_CLASSIFIER=claude but ANTHROPIC_API_KEY is empty; using keywords")
			c.Text = ai.KeywordText{}
		} else {
			c.Text = claude
		}
	case "off":
		c.Text = ai.Off{}
	default:
		c.Text = ai.KeywordText{}
	}
	slog.Info("classifiers ready", "image", cfg.AIImageClassifier, "text", cfg.AITextClassifier)
	return c
}

func fatal(msg string, err error) {
	slog.Error(msg, "err", err)
	os.Exit(1)
}
