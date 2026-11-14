package report

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"flow/apperr"
	db "flow/db/sqlc"
	"flow/imaging"
	"flow/utils"
)

type CreateReportInput struct {
	Lat, Lng      *float64
	AddressText   string
	Description   string
	LeakType      string
	Size          string
	Duration      string
	Phone         string // optional; needed for SMS updates
	Locale        string
	Photo         []byte // raw upload; may be nil when a description is given
	JoinClusterID *uuid.UUID
	ReporterID    *uuid.UUID
}

type CreateReportResult struct {
	ReferenceCode   string `json:"reference_code"`
	Status          string `json:"status"`
	JoinedExisting  bool   `json:"joined_existing"`
	TypicalFixHours int    `json:"typical_fix_hours"`
	SmsUpdates      bool   `json:"sms_updates"`
}

const (
	maxDescription = 1000
	maxAddress     = 200
)

func (in *CreateReportInput) validate() map[string]string {
	errs := map[string]string{}
	in.Description = strings.TrimSpace(in.Description)
	in.AddressText = strings.TrimSpace(in.AddressText)
	if len(in.Photo) == 0 && in.Description == "" {
		errs["description"] = "Add a photo or describe the leak in a few words."
	}
	if len(in.Description) > maxDescription {
		errs["description"] = fmt.Sprintf("Keep the description under %d characters.", maxDescription)
	}
	if len(in.AddressText) > maxAddress {
		errs["address_text"] = fmt.Sprintf("Keep the landmark under %d characters.", maxAddress)
	}
	if in.Lat != nil && (*in.Lat < -90 || *in.Lat > 90) || in.Lng != nil && (*in.Lng < -180 || *in.Lng > 180) {
		errs["location"] = "That location doesn't look right. Drag the pin to where the leak is."
	}
	if in.LeakType != "" && !slices.Contains(LeakTypes, in.LeakType) {
		errs["leak_type"] = "Pick one of the leak types shown."
	}
	if in.Size != "" && !slices.Contains(Sizes, in.Size) {
		errs["size"] = "Pick one of the sizes shown."
	}
	if in.Duration != "" && !slices.Contains(Durations, in.Duration) {
		errs["duration"] = "Pick one of the options shown."
	}
	if in.Phone != "" {
		phone, err := utils.NormalizeKenyanPhone(in.Phone)
		if err != nil {
			errs["phone"] = "Enter a Kenyan mobile number, like 0712 345 678."
		}
		in.Phone = phone
	}
	if in.Locale != "sw" {
		in.Locale = "en"
	}
	if len(errs) == 0 {
		return nil
	}
	return errs
}

// CreateReport saves a citizen's report. The photo is re-encoded so no hidden
// metadata is stored, the report is placed in a duplicate group (a new one,
// or an existing one the citizen chose to join), and AI analysis is queued.
func (s *Service) CreateReport(ctx context.Context, in CreateReportInput) (CreateReportResult, error) {
	if errs := in.validate(); errs != nil {
		return CreateReportResult{}, apperr.Validation(errs)
	}

	var photo []byte
	if len(in.Photo) > 0 {
		res, err := imaging.Process(in.Photo)
		switch {
		case errors.Is(err, imaging.ErrTooLarge):
			return CreateReportResult{}, apperr.Validation(map[string]string{"photo": "That photo is too large. Try taking it again, or choose a smaller one (under 10 MB)."})
		case errors.Is(err, imaging.ErrUnsupported), errors.Is(err, imaging.ErrCorrupt):
			return CreateReportResult{}, apperr.Validation(map[string]string{"photo": "We couldn't read that file. Use a JPG, PNG or WebP photo."})
		case err != nil:
			return CreateReportResult{}, err
		}
		photo = res.Data
		// The photo's own GPS is only a fallback; the pin the citizen confirmed wins.
		if in.Lat == nil && res.Lat != nil {
			in.Lat, in.Lng = res.Lat, res.Lng
		}
	}
	if in.Lat == nil || in.Lng == nil {
		return CreateReportResult{}, apperr.Validation(map[string]string{"location": "We need to know where the leak is. Drag the pin to the spot."})
	}

	utilityID, err := s.store.GetUtilityForPoint(ctx, db.GetUtilityForPointParams{Lat: *in.Lat, Lng: *in.Lng})
	if err != nil {
		if db.IsNotFound(err) {
			return CreateReportResult{}, apperr.New(http.StatusUnprocessableEntity, "outside_service_area",
				"This spot is outside the area we cover (Nairobi). Check the pin is on the leak, or contact your local water company.")
		}
		return CreateReportResult{}, err
	}

	// Upload first so a storage outage fails before anything is saved.
	var photoKey string
	if photo != nil {
		photoKey = fmt.Sprintf("reports/%s/%s.jpg", s.now().UTC().Format("2006/01/02"), uuid.NewString())
		if err := s.photos.Put(ctx, photoKey, photo, "image/jpeg"); err != nil {
			return CreateReportResult{}, fmt.Errorf("store photo: %w", err)
		}
	}

	var (
		reportID uuid.UUID
		ref      string
		joined   bool
		primary  *uuid.UUID
	)
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		params := db.CreateReportParams{
			ReporterID: in.ReporterID, ReporterPhone: optional(in.Phone), Locale: in.Locale,
			Lat: *in.Lat, Lng: *in.Lng, AddressText: in.AddressText, Description: in.Description,
			LeakType: optional(in.LeakType), SizeEstimate: optional(in.Size), Duration: optional(in.Duration),
			UtilityID: &utilityID,
		}
		reportID, ref, err = createWithUniqueRef(ctx, q, params)
		if err != nil {
			return err
		}
		if err := q.CreateStatusEvent(ctx, db.CreateStatusEventParams{ReportID: reportID, ToStatus: StatusReceived}); err != nil {
			return err
		}
		if photoKey != "" {
			if _, err := q.CreatePhoto(ctx, db.CreatePhotoParams{ReportID: reportID, StorageKey: photoKey, Kind: "before",
				ContentType: "image/jpeg", SizeBytes: int32(len(photo))}); err != nil {
				return err
			}
		}
		if in.JoinClusterID != nil {
			p, ok, err := s.joinCluster(ctx, q, *in.JoinClusterID, reportID, utilityID, *in.Lat, *in.Lng)
			if err != nil {
				return err
			}
			if ok {
				joined, primary = true, &p
				return nil
			}
		}
		clusterID, err := q.CreateClusterForReport(ctx, reportID)
		if err != nil {
			return err
		}
		return q.MoveReportsToCluster(ctx, db.MoveReportsToClusterParams{ClusterID: clusterID, ReportIds: []uuid.UUID{reportID}})
	})
	if err != nil {
		return CreateReportResult{}, err
	}

	s.enqueue(ctx, "analyze_report", s.tasks.DistributeTaskAnalyzeReport(ctx, &PayloadAnalyzeReport{ReportID: reportID}))
	if primary != nil {
		s.enqueue(ctx, "score_report", s.tasks.DistributeTaskScoreReport(ctx, &PayloadScoreReport{ReportID: *primary}))
	}
	if in.Phone != "" {
		s.enqueue(ctx, "send_status_sms", s.tasks.DistributeTaskSendStatusSms(ctx, &PayloadSendStatusSms{ReportID: reportID, Status: StatusReceived}))
	}

	status := StatusReceived
	if joined {
		// A +1 shares its group's progress.
		if r, err := s.store.GetReport(ctx, reportID); err == nil {
			status = r.Status
		}
	}
	return CreateReportResult{
		ReferenceCode: ref, Status: status, JoinedExisting: joined,
		TypicalFixHours: s.typicalFixHours(ctx, &utilityID, nil), SmsUpdates: in.Phone != "",
	}, nil
}

func createWithUniqueRef(ctx context.Context, q db.Querier, p db.CreateReportParams) (uuid.UUID, string, error) {
	for attempt := 0; attempt < 5; attempt++ {
		p.ReferenceCode = utils.RandomReferenceCode()
		id, err := q.CreateReport(ctx, p)
		if err == nil {
			return id, p.ReferenceCode, nil
		}
		if db.ErrorCode(err) != db.UniqueViolation {
			return uuid.Nil, "", err
		}
	}
	return uuid.Nil, "", errors.New("could not generate a unique reference code")
}

// joinCluster adds a citizen's "+1" to an existing group. The citizen picked
// it from our nearby list, but we re-check it is still open and still close,
// since the list may be stale or the request crafted.
func (s *Service) joinCluster(ctx context.Context, q db.Querier, clusterID, reportID, utilityID uuid.UUID, lat, lng float64) (uuid.UUID, bool, error) {
	settings := s.settingsFor(ctx, q, &utilityID)
	matches, err := q.ListNearbyOpenClusters(ctx, db.ListNearbyOpenClustersParams{
		Lat: lat, Lng: lng, RadiusM: settings.Params.DuplicateRadiusM * 2,
		Since:     s.now().AddDate(0, 0, -settings.Params.DuplicateWindowDays*2),
		UtilityID: &utilityID, MaxResults: 10,
	})
	if err != nil {
		return uuid.Nil, false, err
	}
	for _, m := range matches {
		if m.ClusterID != clusterID {
			continue
		}
		if err := q.MoveReportsToCluster(ctx, db.MoveReportsToClusterParams{ClusterID: clusterID, ReportIds: []uuid.UUID{reportID}}); err != nil {
			return uuid.Nil, false, err
		}
		if err := q.RefreshCluster(ctx, clusterID); err != nil {
			return uuid.Nil, false, err
		}
		// The +1 takes on the group's current status so the citizen sees real progress.
		primary, err := q.GetReport(ctx, m.PrimaryReportID)
		if err != nil {
			return uuid.Nil, false, err
		}
		if primary.Status != StatusReceived {
			if err := q.SetReportStatus(ctx, db.SetReportStatusParams{ID: reportID, Status: primary.Status, FixedAt: primary.FixedAt}); err != nil {
				return uuid.Nil, false, err
			}
			if err := q.CreateStatusEvent(ctx, db.CreateStatusEventParams{ReportID: reportID, FromStatus: ptr(StatusReceived),
				ToStatus: primary.Status, Note: "Added to an existing report of the same leak"}); err != nil {
				return uuid.Nil, false, err
			}
		}
		return m.PrimaryReportID, true, nil
	}
	return uuid.Nil, false, nil
}

type NearbyMatch struct {
	ClusterID     uuid.UUID `json:"cluster_id"`
	ReferenceCode string    `json:"reference_code"`
	LeakType      *string   `json:"leak_type"`
	Status        string    `json:"status"`
	ReportCount   int32     `json:"report_count"`
	DistanceM     int       `json:"distance_m"`
	Lat           float64   `json:"lat"`
	Lng           float64   `json:"lng"`
	CreatedAt     time.Time `json:"created_at"`
}

type NearbyResult struct {
	Covered bool          `json:"covered"`
	Matches []NearbyMatch `json:"matches"`
}

// Nearby powers "Others have reported a leak near here" before submitting.
func (s *Service) Nearby(ctx context.Context, lat, lng float64, leakType string) (NearbyResult, error) {
	res := NearbyResult{Matches: []NearbyMatch{}}
	utilityID, err := s.store.GetUtilityForPoint(ctx, db.GetUtilityForPointParams{Lat: lat, Lng: lng})
	if err != nil {
		if db.IsNotFound(err) {
			return res, nil
		}
		return res, err
	}
	res.Covered = true
	settings := s.settingsFor(ctx, s.store, &utilityID)
	var lt *string
	if slices.Contains(LeakTypes, leakType) && leakType != "other" {
		lt = &leakType
	}
	rows, err := s.store.ListNearbyOpenClusters(ctx, db.ListNearbyOpenClustersParams{
		Lat: lat, Lng: lng, RadiusM: settings.Params.DuplicateRadiusM,
		Since:    s.now().AddDate(0, 0, -settings.Params.DuplicateWindowDays),
		LeakType: lt, UtilityID: &utilityID, MaxResults: 3,
	})
	if err != nil {
		return res, err
	}
	for _, r := range rows {
		res.Matches = append(res.Matches, NearbyMatch{ClusterID: r.ClusterID, ReferenceCode: r.ReferenceCode,
			LeakType: r.LeakType, Status: r.Status, ReportCount: r.ReportCount,
			DistanceM: int(r.DistanceM + 0.5), Lat: r.CentroidLat, Lng: r.CentroidLng, CreatedAt: r.CreatedAt})
	}
	return res, nil
}

type PublicEvent struct {
	Status    string    `json:"status"`
	Note      string    `json:"note,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// PublicStatus is what anyone holding the reference code may see. It has no
// photos, phone numbers or staff names.
type PublicStatus struct {
	ReferenceCode   string        `json:"reference_code"`
	Status          string        `json:"status"`
	LeakType        *string       `json:"leak_type"`
	AreaName        string        `json:"area_name"`
	AddressText     string        `json:"address_text"`
	OthersReported  int32         `json:"others_reported"`
	InvalidReason   string        `json:"invalid_reason,omitempty"`
	TypicalFixHours int           `json:"typical_fix_hours"`
	Events          []PublicEvent `json:"events"`
	// The reporter's own photo and the technician's after-repair photo.
	Photos []PublicPhoto `json:"photos"`
	// The reporter's answer to "Was it fixed properly?": fixed, not_fixed or empty.
	Feedback  string    `json:"feedback,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type PublicPhoto struct {
	Kind string `json:"kind"`
	URL  string `json:"url"`
}

func (s *Service) PublicStatus(ctx context.Context, ref string) (PublicStatus, error) {
	r, err := s.store.GetReportByRef(ctx, strings.TrimSpace(ref))
	if err != nil {
		if db.IsNotFound(err) {
			return PublicStatus{}, apperr.New(http.StatusNotFound, "report_not_found",
				"We couldn't find a report with that number. Check it and try again. It looks like FLW-7K3QPX.")
		}
		return PublicStatus{}, err
	}
	events, err := s.store.ListStatusEvents(ctx, r.ID)
	if err != nil {
		return PublicStatus{}, err
	}
	out := PublicStatus{
		ReferenceCode: r.ReferenceCode, Status: r.Status, LeakType: r.LeakType, AreaName: r.ZoneName,
		AddressText: r.AddressText, OthersReported: r.DuplicateCount, InvalidReason: r.InvalidReason,
		TypicalFixHours: s.typicalFixHours(ctx, r.UtilityID, r.Severity), Events: []PublicEvent{},
		Photos: s.publicPhotos(ctx, r), Feedback: deref(r.CitizenFeedback),
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
	for _, e := range events {
		pe := PublicEvent{Status: e.ToStatus, CreatedAt: e.CreatedAt}
		if e.ToStatus == StatusInvalid {
			pe.Note = e.Note
		}
		out.Events = append(out.Events, pe)
	}
	return out, nil
}

// publicPhotos returns at most one "before" photo (this reporter's own) and
// the latest "after" photo for the group, which the technician uploads to the
// group's main report. Photos from other reporters are never shown.
func (s *Service) publicPhotos(ctx context.Context, r db.ReportView) []PublicPhoto {
	ids := []uuid.UUID{r.ID}
	if primary, err := s.primaryOf(ctx, s.store, r); err == nil && primary.ID != r.ID {
		ids = append(ids, primary.ID)
	}
	rows, err := s.store.ListPhotosForReports(ctx, ids)
	if err != nil {
		slog.ErrorContext(ctx, "load public photos", "err", err)
		return []PublicPhoto{}
	}
	var before, after *db.ReportPhoto
	for i := range rows {
		p := &rows[i]
		switch {
		case p.Kind == "before" && p.ReportID == r.ID && before == nil:
			before = p
		case p.Kind == "after":
			after = p // rows are oldest first, so this keeps the latest
		}
	}
	out := []PublicPhoto{}
	for _, p := range []*db.ReportPhoto{before, after} {
		if p == nil {
			continue
		}
		url, err := s.photos.SignedURL(ctx, p.StorageKey)
		if err != nil {
			slog.ErrorContext(ctx, "sign photo url", "photo_id", p.ID, "err", err)
			continue
		}
		out = append(out, PublicPhoto{Kind: p.Kind, URL: url})
	}
	return out
}

// Feedback records the reporter's answer to "Was it fixed properly?". A "no"
// sends the group back to dispatchers for review; it doesn't reopen the leak
// by itself, so a dispatcher decides what happens next.
func (s *Service) Feedback(ctx context.Context, ref string, fixed bool) (PublicStatus, error) {
	r, err := s.store.GetReportByRef(ctx, strings.TrimSpace(ref))
	if err != nil {
		if db.IsNotFound(err) {
			return PublicStatus{}, apperr.New(http.StatusNotFound, "report_not_found",
				"We couldn't find a report with that number. Check it and try again.")
		}
		return PublicStatus{}, err
	}
	if r.Status != StatusFixed {
		return PublicStatus{}, apperr.Conflict("feedback_not_allowed", "You can answer this once the leak is marked Fixed.")
	}
	answer := "fixed"
	if !fixed {
		answer = "not_fixed"
	}
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		if err := q.SetCitizenFeedback(ctx, db.SetCitizenFeedbackParams{ID: r.ID, Feedback: &answer}); err != nil {
			return err
		}
		primary, err := s.primaryOf(ctx, q, r)
		if err != nil {
			return err
		}
		if !fixed {
			if err := q.FlagReportForReview(ctx, db.FlagReportForReviewParams{ID: primary.ID,
				ReviewReason: fmt.Sprintf("The reporter of %s says the leak is not fixed yet.", r.ReferenceCode)}); err != nil {
				return err
			}
		}
		return q.CreateAuditEntry(ctx, db.CreateAuditEntryParams{ReportID: primary.ID, Action: "citizen_feedback",
			Details: mustJSON(map[string]any{"reference_code": r.ReferenceCode, "answer": answer})})
	})
	if err != nil {
		return PublicStatus{}, err
	}
	return s.PublicStatus(ctx, r.ReferenceCode)
}

// MyReports lists a citizen's reports, including ones made before signing in
// with the same phone number.
func (s *Service) MyReports(ctx context.Context, userID uuid.UUID, phone string) ([]PublicStatus, error) {
	rows, err := s.store.ListReportsForReporter(ctx, db.ListReportsForReporterParams{UserID: userID, Phone: phone})
	if err != nil {
		return nil, err
	}
	out := make([]PublicStatus, 0, len(rows))
	for _, r := range rows {
		out = append(out, PublicStatus{
			ReferenceCode: r.ReferenceCode, Status: r.Status, LeakType: r.LeakType, AreaName: r.ZoneName,
			AddressText: r.AddressText, OthersReported: r.DuplicateCount, InvalidReason: r.InvalidReason,
			Events: []PublicEvent{}, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		})
	}
	return out, nil
}

// fallbackFixHours are shown until there is enough history to measure.
var fallbackFixHours = map[string]int{"critical": 24, "high": 48, "medium": 96, "low": 168}

const minFixSamples = 5

func (s *Service) typicalFixHours(ctx context.Context, utilityID *uuid.UUID, severity *string) int {
	row, err := s.store.GetTypicalFixHours(ctx, db.GetTypicalFixHoursParams{UtilityID: utilityID, Severity: severity})
	if err != nil {
		slog.ErrorContext(ctx, "typical fix hours", "err", err)
	}
	if err == nil && row.Samples >= minFixSamples && row.Hours > 0 {
		return int(row.Hours + 0.5)
	}
	if h, ok := fallbackFixHours[deref(severity)]; ok {
		return h
	}
	return 72
}
