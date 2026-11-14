package workers

import (
	"context"
	"encoding/json"
	"time"

	db "flow/db/sqlc"
	"flow/report"
)

// Task types stored in jobs.type.
const (
	TaskAnalyzeReport = "task:analyze_report"
	TaskScoreReport   = "task:score_report"
	TaskRescoreAll    = "task:rescore_all"
	TaskSendStatusSms = "task:send_status_sms"
)

type TaskDistributor interface {
	report.TaskDistributor
	DistributeTaskRescoreAll(ctx context.Context) error
}

// PGTaskDistributor queues tasks in the Postgres jobs table, so the MVP needs
// no separate queue service.
type PGTaskDistributor struct {
	store db.Store
}

func NewPGTaskDistributor(store db.Store) TaskDistributor {
	return &PGTaskDistributor{store: store}
}

func (d *PGTaskDistributor) enqueue(ctx context.Context, taskType string, payload any, runAfter time.Time) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return d.store.EnqueueJob(ctx, db.EnqueueJobParams{Type: taskType, Payload: b, RunAfter: runAfter})
}

func (d *PGTaskDistributor) DistributeTaskAnalyzeReport(ctx context.Context, payload *report.PayloadAnalyzeReport) error {
	return d.enqueue(ctx, TaskAnalyzeReport, payload, time.Now())
}

func (d *PGTaskDistributor) DistributeTaskScoreReport(ctx context.Context, payload *report.PayloadScoreReport) error {
	return d.enqueue(ctx, TaskScoreReport, payload, time.Now())
}

func (d *PGTaskDistributor) DistributeTaskSendStatusSms(ctx context.Context, payload *report.PayloadSendStatusSms) error {
	return d.enqueue(ctx, TaskSendStatusSms, payload, time.Now())
}

func (d *PGTaskDistributor) DistributeTaskRescoreAll(ctx context.Context) error {
	return d.enqueue(ctx, TaskRescoreAll, struct{}{}, time.Now())
}
