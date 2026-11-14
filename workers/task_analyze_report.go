package workers

import (
	"context"
	"encoding/json"
	"fmt"

	db "flow/db/sqlc"
	"flow/report"
)

func (p *PGTaskProcessor) ProcessTaskAnalyzeReport(ctx context.Context, job db.ClaimJobRow) error {
	var payload report.PayloadAnalyzeReport
	if err := json.Unmarshal(job.Payload, &payload); err != nil {
		return fmt.Errorf("%w: bad payload: %v", errPermanent, err)
	}
	if err := p.reports.Analyze(ctx, payload.ReportID); err != nil {
		if db.IsNotFound(err) {
			return fmt.Errorf("%w: report %s not found", errPermanent, payload.ReportID)
		}
		return fmt.Errorf("analyze report %s: %w", payload.ReportID, err)
	}
	return nil
}
