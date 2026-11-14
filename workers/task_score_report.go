package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	db "flow/db/sqlc"
	"flow/report"
)

func (p *PGTaskProcessor) ProcessTaskScoreReport(ctx context.Context, job db.ClaimJobRow) error {
	var payload report.PayloadScoreReport
	if err := json.Unmarshal(job.Payload, &payload); err != nil {
		return fmt.Errorf("%w: bad payload: %v", errPermanent, err)
	}
	return p.reports.Rescore(ctx, payload.ReportID)
}

func (p *PGTaskProcessor) ProcessTaskRescoreAll(ctx context.Context, _ db.ClaimJobRow) error {
	n, err := p.reports.RescoreAll(ctx)
	if err != nil {
		return err
	}
	slog.Info("rescored open reports", "count", n)
	return nil
}
