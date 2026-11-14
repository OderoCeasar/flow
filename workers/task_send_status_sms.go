package workers

import (
	"context"
	"encoding/json"
	"fmt"

	db "flow/db/sqlc"
	"flow/report"
	"flow/sms"
)

func (p *PGTaskProcessor) ProcessTaskSendStatusSms(ctx context.Context, job db.ClaimJobRow) error {
	var payload report.PayloadSendStatusSms
	if err := json.Unmarshal(job.Payload, &payload); err != nil {
		return fmt.Errorf("%w: bad payload: %v", errPermanent, err)
	}
	phone, locale, ref, note, ok, err := p.reports.StatusSms(ctx, payload.ReportID, payload.Status)
	if err != nil {
		return err
	}
	if !ok {
		return nil // the reporter didn't ask for updates
	}
	msg := sms.StatusMessage(locale, payload.Status, ref, note)
	if msg == "" {
		return nil
	}
	return p.smsSender.SendSms(ctx, phone, msg)
}
