package report

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"flow/ai"
	db "flow/db/sqlc"
)

// Analyze runs the AI classifiers on a new report, sets severity, looks for a
// likely duplicate to suggest, then scores it. It never merges on its own:
// a dispatcher confirms every merge.
func (s *Service) Analyze(ctx context.Context, reportID uuid.UUID) error {
	r, err := s.store.GetReport(ctx, reportID)
	if err != nil {
		return err
	}
	settings := s.settingsFor(ctx, s.store, r.UtilityID)
	threshold := settings.Params.ReviewConfidence

	leakType, size := r.LeakType, r.SizeEstimate
	var reviewReasons []string
	notALeak := false

	// Text: only used to fill what the citizen left blank.
	var aiText json.RawMessage
	if s.ai.Text != nil && r.Description != "" {
		res, err := s.ai.Text.ClassifyText(ctx, r.Description)
		if err != nil {
			slog.WarnContext(ctx, "text classifier failed", "report_id", reportID, "err", err)
		} else {
			aiText, _ = json.Marshal(res)
			if leakType == nil && res.LeakType != "" {
				leakType = &res.LeakType
			}
			if size == nil && res.Size != "" {
				size = &res.Size
			}
		}
	}

	// Image: tag every "before" photo; the most confident label wins.
	if s.ai.Image != nil {
		photos, err := s.store.ListPhotosForReports(ctx, []uuid.UUID{reportID})
		if err != nil {
			return err
		}
		var best *ai.Label
		for _, p := range photos {
			if p.Kind != "before" {
				continue
			}
			img, err := s.photos.Get(ctx, p.StorageKey)
			if err != nil {
				return fmt.Errorf("load photo %s: %w", p.ID, err)
			}
			res, err := s.ai.Image.ClassifyImage(ctx, img, p.ContentType)
			if err != nil {
				slog.WarnContext(ctx, "image classifier failed", "photo_id", p.ID, "err", err)
				reviewReasons = append(reviewReasons, "The photo couldn't be checked automatically.")
				continue
			}
			if res.Model == "off" {
				continue
			}
			if err := s.store.SetPhotoLabels(ctx, db.SetPhotoLabelsParams{ID: p.ID, AiLabels: mustJSON(res)}); err != nil {
				return err
			}
			if best == nil || res.Top.Confidence > best.Confidence {
				top := res.Top
				best = &top
			}
		}
		if best != nil {
			switch {
			case best.Label == ai.LabelNotALeak && best.Confidence >= threshold:
				notALeak = true
				reviewReasons = append(reviewReasons, fmt.Sprintf("The photo may not show a leak (%d%% sure).", pct(best.Confidence)))
			case best.Confidence < threshold:
				reviewReasons = append(reviewReasons, fmt.Sprintf("The photo check wasn't sure (%d%%).", pct(best.Confidence)))
			case leakType == nil && best.Label != ai.LabelNotALeak:
				leakType = &best.Label
			case leakType != nil && best.Label != ai.LabelNotALeak && *leakType != best.Label && *leakType != "other":
				reviewReasons = append(reviewReasons, "The photo and the citizen's answer suggest different leak types.")
			}
		}
	}

	reviewReason := ""
	for i, reason := range reviewReasons {
		if i > 0 {
			reviewReason += " "
		}
		reviewReason += reason
	}
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		if err := q.SetReportAnalysis(ctx, db.SetReportAnalysisParams{
			ID: reportID, LeakType: leakType, SizeEstimate: size, IsMain: r.IsMain || InferIsMain(leakType, size),
			AiText: aiText, NeedsReview: len(reviewReasons) > 0, ReviewReason: reviewReason,
		}); err != nil {
			return err
		}
		return q.SetReportAutoSeverity(ctx, db.SetReportAutoSeverityParams{ID: reportID, Severity: ptr(DeriveSeverity(leakType, size, notALeak))})
	})
	if err != nil {
		return err
	}
	if err := s.suggestDuplicate(ctx, reportID, settings); err != nil {
		return err
	}
	primary, err := s.primaryOf(ctx, s.store, r)
	if err != nil {
		return err
	}
	return s.Rescore(ctx, primary.ID)
}

// suggestDuplicate records the nearest matching open group, if any, for a
// dispatcher to confirm. Reports that already joined a group are skipped.
func (s *Service) suggestDuplicate(ctx context.Context, reportID uuid.UUID, settings Settings) error {
	r, err := s.store.GetReport(ctx, reportID)
	if err != nil {
		return err
	}
	if !r.IsPrimary || r.DuplicateCount > 0 || !IsOpen(r.Status) {
		return nil
	}
	matches, err := s.store.ListNearbyOpenClusters(ctx, db.ListNearbyOpenClustersParams{
		Lat: r.Lat, Lng: r.Lng, RadiusM: settings.Params.DuplicateRadiusM,
		Since:    r.CreatedAt.AddDate(0, 0, -settings.Params.DuplicateWindowDays),
		LeakType: r.LeakType, ExcludeClusterID: r.ClusterID, UtilityID: r.UtilityID, MaxResults: 1,
	})
	if err != nil {
		return err
	}
	var suggestion *uuid.UUID
	if len(matches) > 0 {
		suggestion = &matches[0].ClusterID
	}
	return s.store.SetReportSuggestedCluster(ctx, db.SetReportSuggestedClusterParams{ID: reportID, SuggestedClusterID: suggestion})
}

// Rescore recomputes a group's priority from its primary report and stores the
// explanation alongside it.
func (s *Service) Rescore(ctx context.Context, reportID uuid.UUID) error {
	r, err := s.store.GetReport(ctx, reportID)
	if err != nil {
		if db.IsNotFound(err) {
			return nil // deleted since the job was queued
		}
		return err
	}
	settings := s.settingsFor(ctx, s.store, r.UtilityID)

	var site *NearbySite
	row, err := s.store.GetNearestSensitiveSite(ctx, db.GetNearestSensitiveSiteParams{Lat: r.Lat, Lng: r.Lng, MaxM: settings.Params.SensitiveRadiusM})
	if err == nil {
		site = &NearbySite{Name: row.Name, Kind: row.Kind, DistanceM: row.DistanceM}
	} else if !db.IsNotFound(err) {
		return err
	}

	var override *int
	if r.PriorityOverride != nil {
		override = ptr(int(*r.PriorityOverride))
	}
	score, items := ComputePriority(PriorityInput{
		Severity: deref(r.Severity), DuplicateCount: int(r.DuplicateCount), OpenedAt: r.CreatedAt,
		ClosedAt: r.FixedAt, Now: s.now(), NearestSite: site, LitresPerHour: LitresPerHour(r.LeakType, r.SizeEstimate),
		IsMain: r.IsMain, Override: override, OverrideReason: r.PriorityOverrideReason,
	}, settings)
	return s.store.SetReportPriority(ctx, db.SetReportPriorityParams{ID: r.ID, PriorityScore: int32(score), PriorityBreakdown: mustJSON(items)})
}

// RescoreAll refreshes every open group, so age and settings changes show up.
func (s *Service) RescoreAll(ctx context.Context) (int, error) {
	ids, err := s.store.ListOpenPrimaryReportIDs(ctx)
	if err != nil {
		return 0, err
	}
	for _, id := range ids {
		if err := s.Rescore(ctx, id); err != nil {
			return 0, fmt.Errorf("rescore %s: %w", id, err)
		}
	}
	return len(ids), nil
}

// StatusSms returns who to text about a status change, or ok=false when the
// reporter left no phone number.
func (s *Service) StatusSms(ctx context.Context, reportID uuid.UUID, status string) (phone, locale, ref, note string, ok bool, err error) {
	r, err := s.store.GetReport(ctx, reportID)
	if err != nil {
		if db.IsNotFound(err) {
			return "", "", "", "", false, nil
		}
		return "", "", "", "", false, err
	}
	if r.ReporterPhone == nil || *r.ReporterPhone == "" {
		return "", "", "", "", false, nil
	}
	return *r.ReporterPhone, r.Locale, r.ReferenceCode, r.InvalidReason, true, nil
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // only called with plain structs
	}
	return b
}

func pct(f float64) int { return int(f*100 + 0.5) }
