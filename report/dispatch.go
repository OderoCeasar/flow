package report

import (
	"context"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"flow/apperr"
	db "flow/db/sqlc"
)

type ListFilter struct {
	Statuses    []string
	Severities  []string
	LeakTypes   []string
	ZoneIDs     []uuid.UUID
	From, To    *time.Time
	Query       string
	NeedsReview bool
	BBox        *[4]float64 // minLng, minLat, maxLng, maxLat
	Sort        string
	Page        int
	PageSize    int
}

type Page[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

// ListReports returns one row per group of duplicates, highest priority first
// unless another sort is asked for. Dispatchers only see their own utility.
func (s *Service) ListReports(ctx context.Context, actor Actor, f ListFilter) (Page[ReportDTO], error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 200 {
		f.PageSize = 50
	}
	if !slices.Contains([]string{"priority", "newest", "oldest", "severity"}, f.Sort) {
		f.Sort = "priority"
	}
	utility := actor.UtilityID
	if actor.Role != "admin" && utility == nil {
		return Page[ReportDTO]{}, apperr.Forbidden()
	}
	var minLng, minLat, maxLng, maxLat *float64
	if b := f.BBox; b != nil {
		minLng, minLat, maxLng, maxLat = &b[0], &b[1], &b[2], &b[3]
	}
	nilIfEmpty := func(v []string) []string {
		if len(v) == 0 {
			return nil
		}
		return v
	}
	var zones []uuid.UUID
	if len(f.ZoneIDs) > 0 {
		zones = f.ZoneIDs
	}
	count, err := s.store.CountPrimaryReports(ctx, db.CountPrimaryReportsParams{
		UtilityID: utility, Statuses: nilIfEmpty(f.Statuses), Severities: nilIfEmpty(f.Severities),
		LeakTypes: nilIfEmpty(f.LeakTypes), ZoneIds: zones, CreatedFrom: f.From, CreatedTo: f.To,
		NeedsReviewOnly: f.NeedsReview, Query: f.Query, MinLng: minLng, MaxLng: maxLng, MinLat: minLat, MaxLat: maxLat,
	})
	if err != nil {
		return Page[ReportDTO]{}, err
	}
	rows, err := s.store.ListPrimaryReports(ctx, db.ListPrimaryReportsParams{
		UtilityID: utility, Statuses: nilIfEmpty(f.Statuses), Severities: nilIfEmpty(f.Severities),
		LeakTypes: nilIfEmpty(f.LeakTypes), ZoneIds: zones, CreatedFrom: f.From, CreatedTo: f.To,
		NeedsReviewOnly: f.NeedsReview, Query: f.Query, MinLng: minLng, MaxLng: maxLng, MinLat: minLat, MaxLat: maxLat,
		Sort: f.Sort, PageLimit: int32(f.PageSize), PageOffset: int32((f.Page - 1) * f.PageSize),
	})
	if err != nil {
		return Page[ReportDTO]{}, err
	}
	return Page[ReportDTO]{Items: toDTOs(rows), Total: int(count), Page: f.Page, PageSize: f.PageSize}, nil
}

type Suggestion struct {
	ClusterID     uuid.UUID `json:"cluster_id"`
	ReferenceCode string    `json:"reference_code"`
	LeakType      *string   `json:"leak_type"`
	ReportCount   int32     `json:"report_count"`
	DistanceM     int       `json:"distance_m"`
}

type ReportDetail struct {
	Report     ReportDTO                `json:"report"`
	Members    []ReportDTO              `json:"members"` // every report in the group, this one included
	Photos     []PhotoDTO               `json:"photos"`
	Events     []db.ListStatusEventsRow `json:"events"`
	Audit      []db.ListAuditEntriesRow `json:"audit"`
	Suggestion *Suggestion              `json:"suggestion"`
}

func (s *Service) Detail(ctx context.Context, actor Actor, id uuid.UUID) (ReportDetail, error) {
	r, err := s.loadReport(ctx, actor, id)
	if err != nil {
		return ReportDetail{}, err
	}
	members := []db.ReportView{r}
	if r.ClusterID != nil {
		if members, err = s.store.ListReportsInCluster(ctx, *r.ClusterID); err != nil {
			return ReportDetail{}, err
		}
	}
	ids := make([]uuid.UUID, len(members))
	for i, m := range members {
		ids[i] = m.ID
	}
	photos, err := s.store.ListPhotosForReports(ctx, ids)
	if err != nil {
		return ReportDetail{}, err
	}
	events, err := s.store.ListStatusEvents(ctx, r.ID)
	if err != nil {
		return ReportDetail{}, err
	}
	audit, err := s.store.ListAuditEntries(ctx, r.ID)
	if err != nil {
		return ReportDetail{}, err
	}
	d := ReportDetail{Report: toDTO(r), Members: toDTOs(members), Photos: s.signPhotos(ctx, photos), Events: events, Audit: audit}
	if r.SuggestedClusterID != nil {
		if c, err := s.store.GetCluster(ctx, *r.SuggestedClusterID); err == nil && c.Status == "open" && c.PrimaryReportID != nil {
			if p, err := s.store.GetReport(ctx, *c.PrimaryReportID); err == nil {
				d.Suggestion = &Suggestion{ClusterID: c.ID, ReferenceCode: p.ReferenceCode, LeakType: p.LeakType,
					ReportCount: c.ReportCount, DistanceM: int(math.Round(haversineM(r.Lat, r.Lng, c.Lat, c.Lng)))}
			}
		}
	}
	return d, nil
}

// UpdateInput is a dispatcher's change to a report. Only set fields change.
// Overrides and marking invalid need a short reason, kept in the audit log.
type UpdateInput struct {
	Status                 *string `json:"status"`
	Note                   string  `json:"note"`
	Severity               *string `json:"severity"`
	SeverityReason         string  `json:"severity_reason"`
	PriorityOverride       *int    `json:"priority_override"`
	PriorityOverrideReason string  `json:"priority_override_reason"`
	ClearPriorityOverride  bool    `json:"clear_priority_override"`
	LeakType               *string `json:"leak_type"`
	SizeEstimate           *string `json:"size_estimate"`
	IsMain                 *bool   `json:"is_main"`
	AcceptAI               bool    `json:"accept_ai"`
	NeedsReview            *bool   `json:"needs_review"`
}

const minReason = 3

func (in *UpdateInput) validate() map[string]string {
	errs := map[string]string{}
	in.Note = strings.TrimSpace(in.Note)
	in.SeverityReason = strings.TrimSpace(in.SeverityReason)
	in.PriorityOverrideReason = strings.TrimSpace(in.PriorityOverrideReason)
	if in.Status != nil {
		if !slices.Contains(Statuses, *in.Status) {
			errs["status"] = "Pick one of the listed statuses."
		} else if *in.Status == StatusInvalid && len(in.Note) < minReason {
			errs["note"] = "Say briefly why this isn't a real leak. The reporter will see it."
		}
	}
	if in.Severity != nil {
		if !slices.Contains(Severities, *in.Severity) {
			errs["severity"] = "Pick low, medium, high or critical."
		} else if len(in.SeverityReason) < minReason {
			errs["severity_reason"] = "Add a short reason for changing the severity."
		}
	}
	if in.PriorityOverride != nil {
		if *in.PriorityOverride < 0 || *in.PriorityOverride > 100 {
			errs["priority_override"] = "Use a number from 0 to 100."
		} else if len(in.PriorityOverrideReason) < minReason {
			errs["priority_override_reason"] = "Add a short reason for changing the priority."
		}
	}
	if in.LeakType != nil && !slices.Contains(LeakTypes, *in.LeakType) {
		errs["leak_type"] = "Pick one of the leak types."
	}
	if in.SizeEstimate != nil && !slices.Contains(Sizes, *in.SizeEstimate) {
		errs["size_estimate"] = "Pick small, medium or large."
	}
	for k, v := range map[string]int{"note": len(in.Note), "severity_reason": len(in.SeverityReason), "priority_override_reason": len(in.PriorityOverrideReason)} {
		if v > 500 {
			errs[k] = "Keep this under 500 characters."
		}
	}
	if len(errs) == 0 {
		return nil
	}
	return errs
}

func (s *Service) Update(ctx context.Context, actor Actor, id uuid.UUID, in UpdateInput) (ReportDetail, error) {
	if !actor.IsStaff() {
		return ReportDetail{}, apperr.Forbidden()
	}
	if errs := in.validate(); errs != nil {
		return ReportDetail{}, apperr.Validation(errs)
	}
	r, err := s.loadReport(ctx, actor, id)
	if err != nil {
		return ReportDetail{}, err
	}
	primary, err := s.primaryOf(ctx, s.store, r)
	if err != nil {
		return ReportDetail{}, err
	}

	var notify []uuid.UUID
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		if in.LeakType != nil || in.SizeEstimate != nil || in.IsMain != nil || in.NeedsReview != nil || in.AcceptAI {
			needsReview := in.NeedsReview
			if in.AcceptAI {
				needsReview = ptr(false)
			}
			if err := q.SetReportDetails(ctx, db.SetReportDetailsParams{ID: r.ID, LeakType: in.LeakType,
				SizeEstimate: in.SizeEstimate, IsMain: in.IsMain, NeedsReview: needsReview}); err != nil {
				return err
			}
			if in.LeakType != nil || in.SizeEstimate != nil {
				lt, sz := r.LeakType, r.SizeEstimate
				if in.LeakType != nil {
					lt = in.LeakType
				}
				if in.SizeEstimate != nil {
					sz = in.SizeEstimate
				}
				if err := q.SetReportAutoSeverity(ctx, db.SetReportAutoSeverityParams{ID: r.ID, Severity: ptr(DeriveSeverity(lt, sz, false))}); err != nil {
					return err
				}
			}
			action := "details_changed"
			if in.AcceptAI {
				action = "ai_accepted"
			}
			if err := s.audit(ctx, q, r.ID, actor, action, map[string]any{
				"leak_type": in.LeakType, "size_estimate": in.SizeEstimate, "is_main": in.IsMain, "needs_review": needsReview,
				"before": map[string]any{"leak_type": r.LeakType, "size_estimate": r.SizeEstimate, "is_main": r.IsMain, "needs_review": r.NeedsReview},
			}); err != nil {
				return err
			}
		}
		if in.Severity != nil {
			if err := q.SetReportSeverityOverride(ctx, db.SetReportSeverityOverrideParams{ID: r.ID, Severity: in.Severity, SeverityReason: in.SeverityReason}); err != nil {
				return err
			}
			if err := s.audit(ctx, q, r.ID, actor, "severity_override", map[string]any{
				"from": r.Severity, "to": *in.Severity, "reason": in.SeverityReason}); err != nil {
				return err
			}
		}
		if in.PriorityOverride != nil || in.ClearPriorityOverride {
			var value *int32
			reason := ""
			if in.PriorityOverride != nil {
				value, reason = ptr(int32(*in.PriorityOverride)), in.PriorityOverrideReason
			}
			if err := q.SetReportPriorityOverride(ctx, db.SetReportPriorityOverrideParams{ID: primary.ID, PriorityOverride: value, PriorityOverrideReason: reason}); err != nil {
				return err
			}
			if err := s.audit(ctx, q, primary.ID, actor, "priority_override", map[string]any{
				"from": primary.PriorityOverride, "to": value, "reason": reason, "computed": primary.PriorityScore}); err != nil {
				return err
			}
		}
		if in.Status != nil && *in.Status != primary.Status {
			ids, err := s.setGroupStatus(ctx, q, primary, *in.Status, &actor.UserID, in.Note)
			if err != nil {
				return err
			}
			notify = ids
		}
		return nil
	})
	if err != nil {
		return ReportDetail{}, err
	}
	s.afterStatusChange(ctx, notify, in.Status)
	if err := s.Rescore(ctx, primary.ID); err != nil {
		return ReportDetail{}, err
	}
	return s.Detail(ctx, actor, id)
}

// setGroupStatus moves every report in a group to the same status, so every
// citizen who reported the leak sees the same progress. Returns the reports
// whose status changed.
func (s *Service) setGroupStatus(ctx context.Context, q db.Querier, primary db.ReportView, status string, actorID *uuid.UUID, note string) ([]uuid.UUID, error) {
	members := []db.ReportView{primary}
	if primary.ClusterID != nil {
		var err error
		if members, err = q.ListReportsInCluster(ctx, *primary.ClusterID); err != nil {
			return nil, err
		}
	}
	var fixedAt *time.Time
	if status == StatusFixed {
		fixedAt = ptr(s.now())
	}
	invalidReason := ""
	if status == StatusInvalid {
		invalidReason = note
	}
	changed := []uuid.UUID{}
	for _, m := range members {
		if m.Status == status {
			continue
		}
		if err := q.SetReportStatus(ctx, db.SetReportStatusParams{ID: m.ID, Status: status, FixedAt: fixedAt, InvalidReason: invalidReason}); err != nil {
			return nil, err
		}
		if err := q.CreateStatusEvent(ctx, db.CreateStatusEventParams{ReportID: m.ID, FromStatus: &m.Status, ToStatus: status, ActorID: actorID, Note: note}); err != nil {
			return nil, err
		}
		changed = append(changed, m.ID)
	}
	if primary.ClusterID != nil {
		if err := q.RefreshCluster(ctx, *primary.ClusterID); err != nil {
			return nil, err
		}
	}
	return changed, nil
}

func (s *Service) afterStatusChange(ctx context.Context, reportIDs []uuid.UUID, status *string) {
	if status == nil {
		return
	}
	for _, id := range reportIDs {
		s.enqueue(ctx, "send_status_sms", s.tasks.DistributeTaskSendStatusSms(ctx, &PayloadSendStatusSms{ReportID: id, Status: *status}))
	}
}

type AssignInput struct {
	TechnicianID uuid.UUID  `json:"technician_id"`
	DueAt        *time.Time `json:"due_at"`
}

// Assign gives a group to a technician and moves it to Scheduled.
func (s *Service) Assign(ctx context.Context, actor Actor, id uuid.UUID, in AssignInput) (ReportDetail, error) {
	if !actor.IsStaff() {
		return ReportDetail{}, apperr.Forbidden()
	}
	r, err := s.loadReport(ctx, actor, id)
	if err != nil {
		return ReportDetail{}, err
	}
	primary, err := s.primaryOf(ctx, s.store, r)
	if err != nil {
		return ReportDetail{}, err
	}
	if !IsOpen(primary.Status) {
		return ReportDetail{}, apperr.Conflict("report_closed", "This report is already Fixed or marked invalid. Reopen it before assigning.")
	}
	tech, err := s.store.GetUser(ctx, in.TechnicianID)
	if err != nil || tech.Role != "technician" || !tech.Active || !actor.canSeeUtility(tech.UtilityID) ||
		tech.UtilityID == nil || primary.UtilityID == nil || *tech.UtilityID != *primary.UtilityID {
		return ReportDetail{}, apperr.Validation(map[string]string{"technician_id": "Pick a technician from your team."})
	}
	if in.DueAt != nil && in.DueAt.Before(s.now().Add(-time.Hour)) {
		return ReportDetail{}, apperr.Validation(map[string]string{"due_at": "The due date is in the past. Pick a later time."})
	}

	var notify []uuid.UUID
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		if err := q.DeactivateAssignments(ctx, primary.ID); err != nil {
			return err
		}
		if _, err := q.CreateAssignment(ctx, db.CreateAssignmentParams{ReportID: primary.ID, TechnicianID: tech.ID,
			AssignedBy: &actor.UserID, DueAt: in.DueAt}); err != nil {
			return err
		}
		if err := s.audit(ctx, q, primary.ID, actor, "assigned", map[string]any{
			"technician_id": tech.ID, "technician_name": tech.Name, "due_at": in.DueAt, "previous": primary.AssigneeID}); err != nil {
			return err
		}
		if primary.Status == StatusReceived || primary.Status == StatusVerified {
			ids, err := s.setGroupStatus(ctx, q, primary, StatusScheduled, &actor.UserID, "Assigned to "+tech.Name)
			if err != nil {
				return err
			}
			notify = ids
		}
		return nil
	})
	if err != nil {
		return ReportDetail{}, err
	}
	s.afterStatusChange(ctx, notify, ptr(StatusScheduled))
	return s.Detail(ctx, actor, id)
}

type MergeInput struct {
	TargetClusterID uuid.UUID   `json:"target_cluster_id"`
	ClusterIDs      []uuid.UUID `json:"cluster_ids"`
}

type MergeResult struct {
	Detail ReportDetail `json:"detail"`
	// MovedReportIDs lets the dashboard offer "Undo" by splitting them back out.
	MovedReportIDs []uuid.UUID `json:"moved_report_ids"`
}

// Merge folds duplicate groups into the target group. Only a dispatcher can
// do this; the system only ever suggests.
func (s *Service) Merge(ctx context.Context, actor Actor, in MergeInput) (MergeResult, error) {
	if !actor.IsStaff() {
		return MergeResult{}, apperr.Forbidden()
	}
	sources := slices.DeleteFunc(slices.Clone(in.ClusterIDs), func(id uuid.UUID) bool { return id == in.TargetClusterID })
	if len(sources) == 0 {
		return MergeResult{}, apperr.Validation(map[string]string{"cluster_ids": "Pick at least one other report to merge in."})
	}
	target, err := s.openClusterFor(ctx, actor, in.TargetClusterID)
	if err != nil {
		return MergeResult{}, err
	}
	targetPrimary, err := s.store.GetReport(ctx, *target.PrimaryReportID)
	if err != nil {
		return MergeResult{}, err
	}

	moved := []uuid.UUID{}
	var notify []uuid.UUID
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		for _, sid := range sources {
			src, err := s.openClusterFor(ctx, actor, sid)
			if err != nil {
				return err
			}
			if src.UtilityID == nil || target.UtilityID == nil || *src.UtilityID != *target.UtilityID {
				return apperr.Validation(map[string]string{"cluster_ids": "You can only merge reports from the same utility."})
			}
			members, err := q.ListReportsInCluster(ctx, sid)
			if err != nil {
				return err
			}
			ids := make([]uuid.UUID, len(members))
			for i, m := range members {
				ids[i] = m.ID
			}
			if err := q.MoveReportsToCluster(ctx, db.MoveReportsToClusterParams{ClusterID: target.ID, ReportIds: ids}); err != nil {
				return err
			}
			if err := q.MarkClusterMerged(ctx, sid); err != nil {
				return err
			}
			if err := q.ClearSuggestionsForCluster(ctx, sid); err != nil {
				return err
			}
			// Assignments live on the primary; merged-in primaries lose theirs.
			for _, m := range members {
				if err := q.DeactivateAssignments(ctx, m.ID); err != nil {
					return err
				}
			}
			moved = append(moved, ids...)
		}
		if err := q.ClearSuggestionsForCluster(ctx, target.ID); err != nil {
			return err
		}
		if err := q.RefreshCluster(ctx, target.ID); err != nil {
			return err
		}
		// Merged-in reports take on the group's progress.
		refreshed, err := q.GetReport(ctx, targetPrimary.ID)
		if err != nil {
			return err
		}
		if notify, err = s.setGroupStatus(ctx, q, refreshed, refreshed.Status, &actor.UserID, "Merged as a duplicate of "+refreshed.ReferenceCode); err != nil {
			return err
		}
		return s.audit(ctx, q, targetPrimary.ID, actor, "merged", map[string]any{"cluster_ids": sources, "report_ids": moved})
	})
	if err != nil {
		return MergeResult{}, err
	}
	s.afterStatusChange(ctx, notify, &targetPrimary.Status)
	if err := s.Rescore(ctx, targetPrimary.ID); err != nil {
		return MergeResult{}, err
	}
	d, err := s.Detail(ctx, actor, targetPrimary.ID)
	return MergeResult{Detail: d, MovedReportIDs: moved}, err
}

type SplitInput struct {
	ReportIDs []uuid.UUID `json:"report_ids"`
}

// Split moves reports out of a group into a new group of their own, for when
// a merge was wrong. The earliest moved report becomes the new primary.
func (s *Service) Split(ctx context.Context, actor Actor, clusterID uuid.UUID, in SplitInput) (ReportDetail, error) {
	if !actor.IsStaff() {
		return ReportDetail{}, apperr.Forbidden()
	}
	c, err := s.store.GetCluster(ctx, clusterID)
	if err != nil {
		if db.IsNotFound(err) {
			return ReportDetail{}, apperr.NotFound("group of reports")
		}
		return ReportDetail{}, err
	}
	if !actor.canSeeUtility(c.UtilityID) {
		return ReportDetail{}, apperr.NotFound("group of reports")
	}
	members, err := s.store.ListReportsInCluster(ctx, clusterID)
	if err != nil {
		return ReportDetail{}, err
	}
	moving, staying := []db.ReportView{}, []db.ReportView{}
	for _, m := range members {
		if slices.Contains(in.ReportIDs, m.ID) {
			moving = append(moving, m)
		} else {
			staying = append(staying, m)
		}
	}
	if len(moving) == 0 || len(moving) != len(in.ReportIDs) {
		return ReportDetail{}, apperr.Validation(map[string]string{"report_ids": "Pick reports that belong to this group."})
	}
	if len(staying) == 0 {
		return ReportDetail{}, apperr.Validation(map[string]string{"report_ids": "Leave at least one report in the group."})
	}
	newPrimary := moving[0] // members come back oldest first

	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		newCluster, err := q.CreateClusterForReport(ctx, newPrimary.ID)
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, len(moving))
		for i, m := range moving {
			ids[i] = m.ID
		}
		if err := q.MoveReportsToCluster(ctx, db.MoveReportsToClusterParams{ClusterID: newCluster, ReportIds: ids}); err != nil {
			return err
		}
		if c.PrimaryReportID != nil && slices.Contains(ids, *c.PrimaryReportID) {
			if err := q.SetClusterPrimary(ctx, db.SetClusterPrimaryParams{ClusterID: clusterID, ReportID: &staying[0].ID}); err != nil {
				return err
			}
			if err := q.DeactivateAssignments(ctx, *c.PrimaryReportID); err != nil {
				return err
			}
		}
		if err := q.RefreshCluster(ctx, clusterID); err != nil {
			return err
		}
		if err := q.RefreshCluster(ctx, newCluster); err != nil {
			return err
		}
		return s.audit(ctx, q, newPrimary.ID, actor, "split", map[string]any{"from_cluster_id": clusterID, "report_ids": ids})
	})
	if err != nil {
		return ReportDetail{}, err
	}
	for _, id := range []uuid.UUID{staying[0].ID, newPrimary.ID} {
		if err := s.Rescore(ctx, id); err != nil {
			return ReportDetail{}, err
		}
	}
	return s.Detail(ctx, actor, newPrimary.ID)
}

func (s *Service) openClusterFor(ctx context.Context, actor Actor, id uuid.UUID) (db.GetClusterRow, error) {
	c, err := s.store.GetCluster(ctx, id)
	if err != nil {
		if db.IsNotFound(err) {
			return c, apperr.NotFound("group of reports")
		}
		return c, err
	}
	if !actor.canSeeUtility(c.UtilityID) {
		return c, apperr.NotFound("group of reports")
	}
	if c.Status != "open" || c.PrimaryReportID == nil {
		return c, apperr.New(http.StatusConflict, "cluster_closed", "One of these reports is already closed or merged. Refresh and try again.")
	}
	return c, nil
}

type TechnicianDTO struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	OpenJobs   int32     `json:"open_jobs"`
	FixedToday int32     `json:"fixed_today"`
	// Metres from the technician's nearest open job to the report being
	// assigned. Nil when unknown (no report given, or no open jobs).
	NearestJobM *int `json:"nearest_job_m"`
}

// Technicians lists the utility's active technicians, least busy first.
// With a report, each also gets the distance from their nearest open job.
func (s *Service) Technicians(ctx context.Context, actor Actor, forReport *uuid.UUID) ([]TechnicianDTO, error) {
	if !actor.IsStaff() {
		return nil, apperr.Forbidden()
	}
	if forReport != nil {
		if _, err := s.loadReport(ctx, actor, *forReport); err != nil {
			return nil, err
		}
	}
	rows, err := s.store.ListTechnicianWorkload(ctx, db.ListTechnicianWorkloadParams{ReportID: forReport, UtilityID: actor.UtilityID})
	if err != nil {
		return nil, err
	}
	out := make([]TechnicianDTO, 0, len(rows))
	for _, r := range rows {
		t := TechnicianDTO{ID: r.ID, Name: r.Name, OpenJobs: r.OpenJobs, FixedToday: r.FixedToday}
		if r.NearestJobM >= 0 {
			t.NearestJobM = ptr(int(math.Round(r.NearestJobM)))
		}
		out = append(out, t)
	}
	return out, nil
}

type Crew struct {
	Technician TechnicianDTO `json:"technician"`
	Jobs       []ReportDTO   `json:"jobs"`
}

// Crews lists every technician with their open jobs, highest priority first.
func (s *Service) Crews(ctx context.Context, actor Actor) ([]Crew, error) {
	techs, err := s.Technicians(ctx, actor, nil)
	if err != nil {
		return nil, err
	}
	jobs, err := s.store.ListOpenAssignedReports(ctx, actor.UtilityID)
	if err != nil {
		return nil, err
	}
	crews := make([]Crew, len(techs))
	index := map[uuid.UUID]int{}
	for i, t := range techs {
		crews[i] = Crew{Technician: t, Jobs: []ReportDTO{}}
		index[t.ID] = i
	}
	for _, j := range jobs {
		if i, ok := index[*j.AssigneeID]; ok {
			crews[i].Jobs = append(crews[i].Jobs, toDTO(j))
		}
	}
	return crews, nil
}

func haversineM(lat1, lng1, lat2, lng2 float64) float64 {
	const r = 6371000.0
	toRad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat, dLng := toRad(lat2-lat1), toRad(lng2-lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * r * math.Asin(math.Sqrt(a))
}
