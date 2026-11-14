package workers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"time"

	db "flow/db/sqlc"
	"flow/report"
	"flow/sms"
)

const (
	pollInterval    = time.Second
	staleAfter      = 10 * time.Minute
	pruneAfter      = 7 * 24 * time.Hour
	maintenanceTick = 5 * time.Minute
)

// errPermanent marks a failure that retrying cannot fix.
var errPermanent = errors.New("permanent failure")

type TaskProcessor interface {
	Start(ctx context.Context) error
	ProcessTaskAnalyzeReport(ctx context.Context, job db.ClaimJobRow) error
	ProcessTaskScoreReport(ctx context.Context, job db.ClaimJobRow) error
	ProcessTaskRescoreAll(ctx context.Context, job db.ClaimJobRow) error
	ProcessTaskSendStatusSms(ctx context.Context, job db.ClaimJobRow) error
}

// PGTaskProcessor pulls jobs from Postgres with SKIP LOCKED, so several worker
// processes can run side by side.
type PGTaskProcessor struct {
	store           db.Store
	distributor     TaskDistributor
	reports         *report.Service
	smsSender       sms.SmsSender
	concurrency     int
	rescoreInterval time.Duration
}

func NewPGTaskProcessor(store db.Store, distributor TaskDistributor, reports *report.Service, smsSender sms.SmsSender, concurrency int, rescoreInterval time.Duration) TaskProcessor {
	if concurrency < 1 {
		concurrency = 1
	}
	return &PGTaskProcessor{store: store, distributor: distributor, reports: reports, smsSender: smsSender,
		concurrency: concurrency, rescoreInterval: rescoreInterval}
}

// Start runs until ctx is cancelled, then lets in-flight jobs finish.
func (p *PGTaskProcessor) Start(ctx context.Context) error {
	slog.Info("worker started", "concurrency", p.concurrency, "rescore_interval", p.rescoreInterval)
	var wg sync.WaitGroup
	for i := 0; i < p.concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.loop(ctx)
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		p.schedule(ctx)
	}()
	wg.Wait()
	slog.Info("worker stopped")
	return nil
}

func (p *PGTaskProcessor) loop(ctx context.Context) {
	for ctx.Err() == nil {
		job, err := p.store.ClaimJob(ctx)
		if err != nil {
			if !db.IsNotFound(err) && ctx.Err() == nil {
				slog.Error("claim job", "err", err)
			}
			select {
			case <-ctx.Done():
			case <-time.After(pollInterval):
			}
			continue
		}
		// Finish the job even if shutdown starts mid-way.
		p.run(context.WithoutCancel(ctx), job)
	}
}

func (p *PGTaskProcessor) run(ctx context.Context, job db.ClaimJobRow) {
	start := time.Now()
	jobCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	err := p.dispatch(jobCtx, job)
	log := slog.With("job_id", job.ID, "type", job.Type, "attempt", job.Attempts, "took", time.Since(start).Round(time.Millisecond).String())
	if err == nil {
		if err := p.store.CompleteJob(ctx, job.ID); err != nil {
			log.Error("complete job", "err", err)
		}
		log.Info("job done")
		return
	}
	if errors.Is(err, errPermanent) || job.Attempts >= job.MaxAttempts {
		log.Error("job failed", "err", err)
		if err := p.store.FailJob(ctx, db.FailJobParams{ID: job.ID, LastError: err.Error()}); err != nil {
			log.Error("mark job failed", "err", err)
		}
		return
	}
	// Exponential backoff: 10s, 20s, 40s, ...
	delay := time.Duration(10*math.Pow(2, float64(job.Attempts-1))) * time.Second
	log.Warn("job will retry", "err", err, "in", delay)
	if err := p.store.RetryJob(ctx, db.RetryJobParams{ID: job.ID, LastError: err.Error(), RunAfter: time.Now().Add(delay)}); err != nil {
		log.Error("requeue job", "err", err)
	}
}

func (p *PGTaskProcessor) dispatch(ctx context.Context, job db.ClaimJobRow) error {
	switch job.Type {
	case TaskAnalyzeReport:
		return p.ProcessTaskAnalyzeReport(ctx, job)
	case TaskScoreReport:
		return p.ProcessTaskScoreReport(ctx, job)
	case TaskRescoreAll:
		return p.ProcessTaskRescoreAll(ctx, job)
	case TaskSendStatusSms:
		return p.ProcessTaskSendStatusSms(ctx, job)
	default:
		return fmt.Errorf("%w: unknown task type %q", errPermanent, job.Type)
	}
}

// schedule queues the periodic rescore and does queue housekeeping.
func (p *PGTaskProcessor) schedule(ctx context.Context) {
	if err := p.distributor.DistributeTaskRescoreAll(ctx); err != nil {
		slog.Error("queue startup rescore", "err", err)
	}
	rescore := time.NewTicker(p.rescoreInterval)
	maintenance := time.NewTicker(maintenanceTick)
	defer rescore.Stop()
	defer maintenance.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-rescore.C:
			if err := p.distributor.DistributeTaskRescoreAll(ctx); err != nil {
				slog.Error("queue rescore", "err", err)
			}
		case <-maintenance.C:
			if n, err := p.store.RequeueStaleJobs(ctx, staleAfter.Seconds()); err != nil {
				slog.Error("requeue stale jobs", "err", err)
			} else if n > 0 {
				slog.Warn("requeued stale jobs", "count", n)
			}
			if err := p.store.PruneJobs(ctx, pruneAfter.Seconds()); err != nil {
				slog.Error("prune jobs", "err", err)
			}
		}
	}
}
