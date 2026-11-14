package db

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"flow/db/dbtest"
)

// Nairobi CBD. One degree of latitude here is about 110,574 m.
const (
	baseLat      = -1.2864
	baseLng      = 36.8172
	metresPerLat = 110574.0
)

func newUtility(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	id, err := testStore.CreateUtility(ctx, CreateUtilityParams{
		Name:        "Test Utility",
		AreaGeojson: `{"type":"Polygon","coordinates":[[[36.6,-1.5],[37.1,-1.5],[37.1,-1.1],[36.6,-1.1],[36.6,-1.5]]]}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func newReportInCluster(t *testing.T, ctx context.Context, utilityID uuid.UUID, lat, lng float64, leakType string) (uuid.UUID, uuid.UUID) {
	t.Helper()
	id, err := testStore.CreateReport(ctx, CreateReportParams{
		ReferenceCode: "FLW-" + uuid.NewString()[:6], Locale: "en", Lat: lat, Lng: lng,
		LeakType: &leakType, UtilityID: &utilityID,
	})
	if err != nil {
		t.Fatal(err)
	}
	cid, err := testStore.CreateClusterForReport(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if err := testStore.MoveReportsToCluster(ctx, MoveReportsToClusterParams{ClusterID: cid, ReportIds: []uuid.UUID{id}}); err != nil {
		t.Fatal(err)
	}
	return id, cid
}

func nearby(t *testing.T, ctx context.Context, utilityID uuid.UUID, lat float64, leakType *string) []ListNearbyOpenClustersRow {
	t.Helper()
	rows, err := testStore.ListNearbyOpenClusters(ctx, ListNearbyOpenClustersParams{
		Lat: lat, Lng: baseLng, RadiusM: 50, Since: time.Now().AddDate(0, 0, -7),
		LeakType: leakType, UtilityID: &utilityID, MaxResults: 5,
	})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestDuplicateDetectionRadius(t *testing.T) {
	dbtest.Truncate(t, testPool)
	ctx := context.Background()
	utilityID := newUtility(t, ctx)
	_, clusterID := newReportInCluster(t, ctx, utilityID, baseLat, baseLng, "burst_pipe")
	burst := "burst_pipe"

	at40 := nearby(t, ctx, utilityID, baseLat+40/metresPerLat, &burst)
	if len(at40) != 1 || at40[0].ClusterID != clusterID {
		t.Fatalf("report 40 m away should match the open leak, got %+v", at40)
	}
	if d := at40[0].DistanceM; d < 39 || d > 41 {
		t.Fatalf("distance = %.1f m, want about 40", d)
	}

	if at60 := nearby(t, ctx, utilityID, baseLat+60/metresPerLat, &burst); len(at60) != 0 {
		t.Fatalf("report 60 m away should not match, got %+v", at60)
	}
}

func TestDuplicateDetectionLeakTypeAndStatus(t *testing.T) {
	dbtest.Truncate(t, testPool)
	ctx := context.Background()
	utilityID := newUtility(t, ctx)
	reportID, clusterID := newReportInCluster(t, ctx, utilityID, baseLat, baseLng, "burst_pipe")
	lat := baseLat + 20/metresPerLat

	sewage := "sewage"
	if rows := nearby(t, ctx, utilityID, lat, &sewage); len(rows) != 0 {
		t.Fatalf("different leak type should not match, got %+v", rows)
	}
	if rows := nearby(t, ctx, utilityID, lat, nil); len(rows) != 1 {
		t.Fatalf("unknown leak type should match anything, got %+v", rows)
	}

	// Once fixed, the leak no longer attracts duplicates.
	now := time.Now()
	if err := testStore.SetReportStatus(ctx, SetReportStatusParams{ID: reportID, Status: "fixed", FixedAt: &now}); err != nil {
		t.Fatal(err)
	}
	if err := testStore.RefreshCluster(ctx, clusterID); err != nil {
		t.Fatal(err)
	}
	if rows := nearby(t, ctx, utilityID, lat, nil); len(rows) != 0 {
		t.Fatalf("fixed leak should not match, got %+v", rows)
	}
}

func TestReportGetsUtilityAndNearestZone(t *testing.T) {
	dbtest.Truncate(t, testPool)
	ctx := context.Background()
	utilityID := newUtility(t, ctx)
	for _, z := range []struct {
		name     string
		lat, lng float64
	}{{"Starehe", -1.2830, 36.8230}, {"Kibra", -1.3133, 36.7850}} {
		if err := testStore.CreateZone(ctx, CreateZoneParams{UtilityID: utilityID, Name: z.name, Lat: z.lat, Lng: z.lng}); err != nil {
			t.Fatal(err)
		}
	}
	found, err := testStore.GetUtilityForPoint(ctx, GetUtilityForPointParams{Lat: baseLat, Lng: baseLng})
	if err != nil || found != utilityID {
		t.Fatalf("utility for CBD point = %v, %v", found, err)
	}
	if _, err := testStore.GetUtilityForPoint(ctx, GetUtilityForPointParams{Lat: -0.09, Lng: 34.77}); !IsNotFound(err) {
		t.Fatalf("Kisumu should be outside the service area, got %v", err)
	}
	id, _ := newReportInCluster(t, ctx, utilityID, -1.3140, 36.7860, "pooling")
	r, err := testStore.GetReport(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if r.ZoneName != "Kibra" || !r.IsPrimary || r.DuplicateCount != 0 {
		t.Fatalf("report view = zone %q primary %v dups %d", r.ZoneName, r.IsPrimary, r.DuplicateCount)
	}
}

func TestJobQueueSkipsDuplicatesAndClaimsOnce(t *testing.T) {
	dbtest.Truncate(t, testPool)
	ctx := context.Background()
	payload := []byte(`{"report_id":"x"}`)
	for i := 0; i < 2; i++ {
		if err := testStore.EnqueueJob(ctx, EnqueueJobParams{Type: "task:test", Payload: payload, RunAfter: time.Now()}); err != nil {
			t.Fatal(err)
		}
	}
	job, err := testStore.ClaimJob(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if job.Attempts != 1 {
		t.Fatalf("attempts = %d", job.Attempts)
	}
	if _, err := testStore.ClaimJob(ctx); !IsNotFound(err) {
		t.Fatalf("identical waiting job should have been skipped; second claim err = %v", err)
	}
}
