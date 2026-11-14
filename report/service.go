package report

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"flow/ai"
	"flow/apperr"
	db "flow/db/sqlc"
	"flow/storage"
)

// TaskDistributor queues background work. workers.PGTaskDistributor implements
// it on top of the jobs table; it is an interface here to avoid an import cycle.
type TaskDistributor interface {
	DistributeTaskAnalyzeReport(ctx context.Context, payload *PayloadAnalyzeReport) error
	DistributeTaskScoreReport(ctx context.Context, payload *PayloadScoreReport) error
	DistributeTaskSendStatusSms(ctx context.Context, payload *PayloadSendStatusSms) error
}

type PayloadAnalyzeReport struct {
	ReportID uuid.UUID `json:"report_id"`
}

type PayloadScoreReport struct {
	ReportID uuid.UUID `json:"report_id"`
}

type PayloadSendStatusSms struct {
	ReportID uuid.UUID `json:"report_id"`
	Status   string    `json:"status"`
}

// Classifiers are only needed by the worker; the API leaves them nil.
type Classifiers struct {
	Image ai.ImageClassifier
	Text  ai.TextClassifier
}

type Service struct {
	store  db.Store
	photos storage.PhotoStore
	tasks  TaskDistributor
	ai     Classifiers
	now    func() time.Time
}

func NewService(store db.Store, photos storage.PhotoStore, tasks TaskDistributor, classifiers Classifiers) *Service {
	return &Service{store: store, photos: photos, tasks: tasks, ai: classifiers, now: time.Now}
}

// Actor is the signed-in person making a request.
type Actor struct {
	UserID    uuid.UUID
	Role      string
	UtilityID *uuid.UUID
}

func (a Actor) IsStaff() bool { return a.Role == "dispatcher" || a.Role == "admin" }

// canSeeUtility is the service-level half of access control (middleware is
// the other half): dispatchers and technicians only touch their own utility.
func (a Actor) canSeeUtility(utilityID *uuid.UUID) bool {
	if a.Role == "admin" {
		return true
	}
	return a.UtilityID != nil && utilityID != nil && *a.UtilityID == *utilityID
}

// ReportDTO is what staff screens see. It leaves out the reporter's phone.
type ReportDTO struct {
	ID                     uuid.UUID       `json:"id"`
	ReferenceCode          string          `json:"reference_code"`
	Lat                    float64         `json:"lat"`
	Lng                    float64         `json:"lng"`
	AddressText            string          `json:"address_text"`
	Description            string          `json:"description"`
	LeakType               *string         `json:"leak_type"`
	SizeEstimate           *string         `json:"size_estimate"`
	Duration               *string         `json:"duration"`
	IsMain                 bool            `json:"is_main"`
	Status                 string          `json:"status"`
	Severity               *string         `json:"severity"`
	SeveritySource         string          `json:"severity_source"`
	SeverityReason         string          `json:"severity_reason"`
	PriorityScore          int32           `json:"priority_score"`
	PriorityBreakdown      json.RawMessage `json:"priority_breakdown"`
	PriorityOverride       *int32          `json:"priority_override"`
	PriorityOverrideReason string          `json:"priority_override_reason"`
	AIText                 json.RawMessage `json:"ai_text"`
	NeedsReview            bool            `json:"needs_review"`
	ReviewReason           string          `json:"review_reason"`
	InvalidReason          string          `json:"invalid_reason"`
	ClusterID              *uuid.UUID      `json:"cluster_id"`
	SuggestedClusterID     *uuid.UUID      `json:"suggested_cluster_id"`
	ZoneID                 *uuid.UUID      `json:"zone_id"`
	ZoneName               string          `json:"zone_name"`
	DuplicateCount         int32           `json:"duplicate_count"`
	IsPrimary              bool            `json:"is_primary"`
	AssigneeID             *uuid.UUID      `json:"assignee_id"`
	AssigneeName           string          `json:"assignee_name"`
	AssigneeDueAt          *time.Time      `json:"assignee_due_at"`
	HasReporterPhone       bool            `json:"has_reporter_phone"`
	FixedAt                *time.Time      `json:"fixed_at"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

func toDTO(r db.ReportView) ReportDTO {
	breakdown := r.PriorityBreakdown
	if len(breakdown) == 0 {
		breakdown = json.RawMessage("[]")
	}
	return ReportDTO{
		ID: r.ID, ReferenceCode: r.ReferenceCode, Lat: r.Lat, Lng: r.Lng, AddressText: r.AddressText,
		Description: r.Description, LeakType: r.LeakType, SizeEstimate: r.SizeEstimate, Duration: r.Duration,
		IsMain: r.IsMain, Status: r.Status, Severity: r.Severity, SeveritySource: r.SeveritySource,
		SeverityReason: r.SeverityReason, PriorityScore: r.PriorityScore, PriorityBreakdown: breakdown,
		PriorityOverride: r.PriorityOverride, PriorityOverrideReason: r.PriorityOverrideReason,
		AIText: r.AiText, NeedsReview: r.NeedsReview, ReviewReason: r.ReviewReason,
		InvalidReason: r.InvalidReason, ClusterID: r.ClusterID, SuggestedClusterID: r.SuggestedClusterID,
		ZoneID: r.ZoneID, ZoneName: r.ZoneName, DuplicateCount: r.DuplicateCount, IsPrimary: r.IsPrimary,
		AssigneeID: r.AssigneeID, AssigneeName: r.AssigneeName, AssigneeDueAt: r.AssigneeDueAt,
		HasReporterPhone: r.ReporterPhone != nil && *r.ReporterPhone != "",
		FixedAt:          r.FixedAt, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func toDTOs(rows []db.ReportView) []ReportDTO {
	out := make([]ReportDTO, len(rows))
	for i, r := range rows {
		out[i] = toDTO(r)
	}
	return out
}

type PhotoDTO struct {
	ID        uuid.UUID       `json:"id"`
	ReportID  uuid.UUID       `json:"report_id"`
	Kind      string          `json:"kind"`
	URL       string          `json:"url"`
	AILabels  json.RawMessage `json:"ai_labels"`
	CreatedAt time.Time       `json:"created_at"`
}

// signPhotos turns stored photos into short-lived URLs. A signing failure
// drops that photo rather than failing the whole screen.
func (s *Service) signPhotos(ctx context.Context, photos []db.ReportPhoto) []PhotoDTO {
	out := []PhotoDTO{}
	for _, p := range photos {
		url, err := s.photos.SignedURL(ctx, p.StorageKey)
		if err != nil {
			slog.ErrorContext(ctx, "sign photo url", "photo_id", p.ID, "err", err)
			continue
		}
		out = append(out, PhotoDTO{ID: p.ID, ReportID: p.ReportID, Kind: p.Kind, URL: url, AILabels: p.AiLabels, CreatedAt: p.CreatedAt})
	}
	return out
}

// settingsFor loads a utility's priority settings, falling back to defaults.
func (s *Service) settingsFor(ctx context.Context, q db.Querier, utilityID *uuid.UUID) Settings {
	if utilityID == nil {
		return DefaultSettings()
	}
	raw, err := q.GetPrioritySettings(ctx, *utilityID)
	if err != nil {
		if !db.IsNotFound(err) {
			slog.ErrorContext(ctx, "load priority settings", "err", err)
		}
		return DefaultSettings()
	}
	return ParseSettings(raw)
}

// loadReport fetches a report and checks the actor may see it.
func (s *Service) loadReport(ctx context.Context, actor Actor, id uuid.UUID) (db.ReportView, error) {
	r, err := s.store.GetReport(ctx, id)
	if err != nil {
		if db.IsNotFound(err) {
			return r, apperr.NotFound("report")
		}
		return r, err
	}
	if !actor.canSeeUtility(r.UtilityID) {
		// Same answer as "doesn't exist", so other utilities' reports stay invisible.
		return r, apperr.NotFound("report")
	}
	return r, nil
}

// primaryOf returns the report that represents a report's group.
func (s *Service) primaryOf(ctx context.Context, q db.Querier, r db.ReportView) (db.ReportView, error) {
	if r.IsPrimary || r.ClusterID == nil {
		return r, nil
	}
	c, err := q.GetCluster(ctx, *r.ClusterID)
	if err != nil || c.PrimaryReportID == nil {
		return r, err
	}
	return q.GetReport(ctx, *c.PrimaryReportID)
}

func (s *Service) audit(ctx context.Context, q db.Querier, reportID uuid.UUID, actor Actor, action string, details any) error {
	b, err := json.Marshal(details)
	if err != nil {
		return err
	}
	return q.CreateAuditEntry(ctx, db.CreateAuditEntryParams{ReportID: reportID, ActorID: &actor.UserID, Action: action, Details: b})
}

// enqueue logs instead of failing the request: the hourly rescore and a
// dispatcher refresh will catch anything a lost job missed.
func (s *Service) enqueue(ctx context.Context, what string, err error) {
	if err != nil {
		slog.ErrorContext(ctx, "enqueue task", "task", what, "err", err)
	}
}
