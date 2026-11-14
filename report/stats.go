package report

import (
	"context"
	"math"
	"time"

	"flow/apperr"
	db "flow/db/sqlc"
)

type Stats struct {
	db.GetStatsSummaryRow
	// Estimated litres lost in the last 90 days by leaks that were open then.
	WaterLostLitres90d float64 `json:"water_lost_litres_90d"`
	// Litres per day being lost right now by leaks still open.
	WaterLossRateLPD float64                    `json:"water_loss_rate_lpd"`
	PerZone          []db.ListReportsPerZoneRow `json:"per_zone"`
	Zones            []db.ListZonesRow          `json:"zones"`
}

func (s *Service) Stats(ctx context.Context, actor Actor) (Stats, error) {
	if !actor.IsStaff() {
		return Stats{}, apperr.Forbidden()
	}
	summary, err := s.store.GetStatsSummary(ctx, actor.UtilityID)
	if err != nil {
		return Stats{}, err
	}
	now := s.now()
	since := now.AddDate(0, 0, -90)
	perZone, err := s.store.ListReportsPerZone(ctx, db.ListReportsPerZoneParams{UtilityID: actor.UtilityID, Since: now.AddDate(0, 0, -30)})
	if err != nil {
		return Stats{}, err
	}
	zones, err := s.store.ListZones(ctx, actor.UtilityID)
	if err != nil {
		return Stats{}, err
	}
	rows, err := s.store.ListLossRows(ctx, db.ListLossRowsParams{UtilityID: actor.UtilityID, Since: since})
	if err != nil {
		return Stats{}, err
	}
	lost, rate := estimateLoss(rows, since, now)
	return Stats{GetStatsSummaryRow: summary, WaterLostLitres90d: lost, WaterLossRateLPD: rate, PerZone: perZone, Zones: zones}, nil
}

// estimateLoss sums each leak's loss rate over the part of its life that falls
// inside the window. It is an estimate, and the UI says so.
func estimateLoss(rows []db.ListLossRowsRow, since, now time.Time) (lostLitres, openRateLPD float64) {
	for _, r := range rows {
		rate := LitresPerHour(r.LeakType, r.SizeEstimate)
		start := r.CreatedAt
		if start.Before(since) {
			start = since
		}
		end := now
		if r.FixedAt != nil {
			end = *r.FixedAt
		} else {
			openRateLPD += rate * 24
		}
		if end.After(start) {
			lostLitres += rate * end.Sub(start).Hours()
		}
	}
	return math.Round(lostLitres), math.Round(openRateLPD)
}
