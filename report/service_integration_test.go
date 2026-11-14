package report

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"flow/ai"
	"flow/apperr"
	"flow/db/dbtest"
	db "flow/db/sqlc"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	if os.Getenv("SKIP_DB_TESTS") != "" {
		os.Exit(m.Run()) // unit tests only
	}
	pool, stop, err := dbtest.Start(context.Background())
	if err != nil {
		fmt.Fprintln(os.Stderr, "start postgis:", err)
		os.Exit(1)
	}
	testPool = pool
	code := m.Run()
	stop()
	os.Exit(code)
}

type memPhotos struct {
	mu   sync.Mutex
	data map[string][]byte
}

func (m *memPhotos) Put(_ context.Context, key string, b []byte, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = b
	return nil
}
func (m *memPhotos) Get(_ context.Context, key string) ([]byte, error) { return m.data[key], nil }
func (m *memPhotos) SignedURL(_ context.Context, key string) (string, error) {
	return "https://example.test/" + key, nil
}

type recordingTasks struct {
	mu      sync.Mutex
	analyze []uuid.UUID
	sms     []PayloadSendStatusSms
}

func (r *recordingTasks) DistributeTaskAnalyzeReport(_ context.Context, p *PayloadAnalyzeReport) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.analyze = append(r.analyze, p.ReportID)
	return nil
}
func (r *recordingTasks) DistributeTaskScoreReport(context.Context, *PayloadScoreReport) error {
	return nil
}
func (r *recordingTasks) DistributeTaskSendStatusSms(_ context.Context, p *PayloadSendStatusSms) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sms = append(r.sms, *p)
	return nil
}

func setup(t *testing.T) (*Service, db.Store, *recordingTasks, uuid.UUID) {
	t.Helper()
	if testPool == nil {
		t.Skip("SKIP_DB_TESTS set")
	}
	dbtest.Truncate(t, testPool)
	ctx := context.Background()
	store := db.NewStore(testPool)
	utilityID, err := store.CreateUtility(ctx, db.CreateUtilityParams{Name: "Nairobi Test",
		AreaGeojson: `{"type":"Polygon","coordinates":[[[36.6,-1.5],[37.1,-1.5],[37.1,-1.1],[36.6,-1.1],[36.6,-1.5]]]}`})
	if err != nil {
		t.Fatal(err)
	}
	tasks := &recordingTasks{}
	svc := NewService(store, &memPhotos{data: map[string][]byte{}}, tasks, Classifiers{Text: ai.KeywordText{}})
	return svc, store, tasks, utilityID
}

func TestCitizenReportToDispatcherMerge(t *testing.T) {
	svc, store, tasks, utilityID := setup(t)
	ctx := context.Background()
	lat, lng := -1.2864, 36.8172

	first, err := svc.CreateReport(ctx, CreateReportInput{Lat: &lat, Lng: &lng, Description: "Pipe burst, gushing water",
		LeakType: "burst_pipe", Size: "large", Phone: "0712345678"})
	if err != nil {
		t.Fatal(err)
	}
	lat2 := lat + 30/110574.0
	second, err := svc.CreateReport(ctx, CreateReportInput{Lat: &lat2, Lng: &lng, Description: "huge burst, water everywhere"})
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks.analyze) != 2 || len(tasks.sms) != 1 {
		t.Fatalf("queued analyze=%d sms=%d, want 2 and 1 (only the first left a phone)", len(tasks.analyze), len(tasks.sms))
	}
	for _, id := range tasks.analyze {
		if err := svc.Analyze(ctx, id); err != nil {
			t.Fatal(err)
		}
	}

	a, _ := store.GetReportByRef(ctx, first.ReferenceCode)
	b, _ := store.GetReportByRef(ctx, second.ReferenceCode)
	if deref(a.Severity) != "critical" || !a.IsMain {
		t.Fatalf("large burst should be a critical main, got %v main=%v", deref(a.Severity), a.IsMain)
	}
	if deref(b.LeakType) != "burst_pipe" {
		t.Fatalf("text classifier should fill the leak type, got %q", deref(b.LeakType))
	}
	if b.SuggestedClusterID == nil || *b.SuggestedClusterID != *a.ClusterID {
		t.Fatal("second report should suggest merging into the first")
	}
	if a.PriorityScore == 0 || len(a.PriorityBreakdown) < 3 {
		t.Fatalf("priority not computed: %d %s", a.PriorityScore, a.PriorityBreakdown)
	}

	user, err := store.CreateUser(ctx, db.CreateUserParams{Role: "dispatcher", Name: "Test Dispatcher", UtilityID: &utilityID})
	if err != nil {
		t.Fatal(err)
	}
	dispatcher := Actor{UserID: user.ID, Role: "dispatcher", UtilityID: &utilityID}
	res, err := svc.Merge(ctx, dispatcher, MergeInput{TargetClusterID: *a.ClusterID, ClusterIDs: []uuid.UUID{*b.ClusterID}})
	if err != nil {
		t.Fatal(err)
	}
	if res.Detail.Report.DuplicateCount != 1 || len(res.Detail.Members) != 2 {
		t.Fatalf("after merge: dups=%d members=%d", res.Detail.Report.DuplicateCount, len(res.Detail.Members))
	}

	// Marking the group verified moves both citizens' reports.
	if _, err := svc.Update(ctx, dispatcher, a.ID, UpdateInput{Status: ptr(StatusVerified)}); err != nil {
		t.Fatal(err)
	}
	b, _ = store.GetReportByRef(ctx, second.ReferenceCode)
	if b.Status != StatusVerified {
		t.Fatalf("duplicate should follow the group, got %s", b.Status)
	}

	// Undo the merge.
	if _, err := svc.Split(ctx, dispatcher, *a.ClusterID, SplitInput{ReportIDs: res.MovedReportIDs}); err != nil {
		t.Fatal(err)
	}
	a, _ = store.GetReportByRef(ctx, first.ReferenceCode)
	if a.DuplicateCount != 0 {
		t.Fatalf("after split dups=%d", a.DuplicateCount)
	}
}

func TestDispatchersOnlySeeTheirUtility(t *testing.T) {
	svc, _, _, utilityID := setup(t)
	ctx := context.Background()
	lat, lng := -1.30, 36.80
	res, err := svc.CreateReport(ctx, CreateReportInput{Lat: &lat, Lng: &lng, Description: "Dripping meter"})
	if err != nil {
		t.Fatal(err)
	}
	r, _ := svc.store.GetReportByRef(ctx, res.ReferenceCode)

	other := uuid.New()
	outsider := Actor{UserID: uuid.New(), Role: "dispatcher", UtilityID: &other}
	if _, err := svc.Detail(ctx, outsider, r.ID); err == nil {
		t.Fatal("dispatcher from another utility must not see the report")
	}
	page, err := svc.ListReports(ctx, outsider, ListFilter{})
	if err != nil || page.Total != 0 {
		t.Fatalf("outsider list total=%d err=%v", page.Total, err)
	}
	insider := Actor{UserID: uuid.New(), Role: "dispatcher", UtilityID: &utilityID}
	if page, _ := svc.ListReports(ctx, insider, ListFilter{}); page.Total != 1 {
		t.Fatalf("insider should see 1 report, got %d", page.Total)
	}
	citizen := Actor{UserID: uuid.New(), Role: "citizen"}
	if _, err := svc.Update(ctx, citizen, r.ID, UpdateInput{Status: ptr(StatusFixed)}); err == nil {
		t.Fatal("citizen must not change status")
	}
}

func TestCreateReportValidation(t *testing.T) {
	svc, _, _, _ := setup(t)
	ctx := context.Background()
	lat, lng := -0.09, 34.77 // Kisumu, outside Nairobi
	_, err := svc.CreateReport(ctx, CreateReportInput{Lat: &lat, Lng: &lng, Description: "Leak"})
	if e, ok := apperr.As(err); !ok || e.Code != "outside_service_area" {
		t.Fatalf("want outside_service_area, got %v", err)
	}
	_, err = svc.CreateReport(ctx, CreateReportInput{Lat: &lat, Lng: &lng})
	if e, ok := apperr.As(err); !ok || e.Fields["description"] == "" {
		t.Fatalf("want a description/photo field error, got %v", err)
	}
	nLat, nLng := -1.29, 36.82
	_, err = svc.CreateReport(ctx, CreateReportInput{Lat: &nLat, Lng: &nLng, Description: "x", Phone: "12345"})
	if e, ok := apperr.As(err); !ok || e.Fields["phone"] == "" {
		t.Fatalf("want a phone field error, got %v", err)
	}
}

func TestCitizenFeedbackOnlyWhenFixedAndFlagsReview(t *testing.T) {
	svc, store, _, _ := setup(t)
	ctx := context.Background()
	lat, lng := -1.2864, 36.8172
	res, err := svc.CreateReport(ctx, CreateReportInput{Lat: &lat, Lng: &lng, Description: "Burst pipe"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Feedback(ctx, res.ReferenceCode, false); err == nil {
		t.Fatal("feedback must wait until the leak is marked Fixed")
	}

	r, _ := store.GetReportByRef(ctx, res.ReferenceCode)
	now := svc.now()
	if err := store.SetReportStatus(ctx, db.SetReportStatusParams{ID: r.ID, Status: StatusFixed, FixedAt: &now}); err != nil {
		t.Fatal(err)
	}
	status, err := svc.Feedback(ctx, res.ReferenceCode, false)
	if err != nil {
		t.Fatal(err)
	}
	if status.Feedback != "not_fixed" {
		t.Fatalf("feedback = %q", status.Feedback)
	}
	r, _ = store.GetReportByRef(ctx, res.ReferenceCode)
	if !r.NeedsReview || r.Status != StatusFixed {
		t.Fatalf("a 'not fixed' answer should flag the report for review without reopening it; review=%v status=%s", r.NeedsReview, r.Status)
	}
}
