// Package seed loads Nairobi demo data into an empty database: one utility,
// its sub-county zones, hospitals and schools, staff accounts, and about 50
// reports with realistic history.
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"

	db "flow/db/sqlc"
	"flow/report"
	"flow/utils"
)

// DemoPassword is printed in the README; demo data is for local use only.
const DemoPassword = "flowdemo123"

// A rough outline of Nairobi County (lng, lat).
var nairobiArea = [][2]float64{
	{36.664, -1.315}, {36.700, -1.250}, {36.735, -1.190}, {36.800, -1.165}, {36.870, -1.160},
	{36.940, -1.175}, {37.000, -1.200}, {37.060, -1.230}, {37.100, -1.270}, {37.080, -1.330},
	{37.000, -1.360}, {36.950, -1.400}, {36.880, -1.440}, {36.790, -1.440}, {36.720, -1.400},
	{36.664, -1.315},
}

type point struct {
	name     string
	lat, lng float64
}

// Sub-county centres; each report belongs to the nearest.
var zones = []point{
	{"Westlands", -1.2676, 36.8108}, {"Dagoretti North", -1.2858, 36.7600}, {"Dagoretti South", -1.2960, 36.7300},
	{"Lang'ata", -1.3390, 36.7620}, {"Kibra", -1.3133, 36.7850}, {"Roysambu", -1.2180, 36.8880},
	{"Kasarani", -1.2219, 36.8967}, {"Ruaraka", -1.2450, 36.8700}, {"Embakasi South", -1.3200, 36.9000},
	{"Embakasi North", -1.2490, 36.9010}, {"Embakasi Central", -1.2730, 36.9150}, {"Embakasi East", -1.3200, 36.9500},
	{"Embakasi West", -1.2830, 36.8900}, {"Makadara", -1.2950, 36.8650}, {"Kamukunji", -1.2750, 36.8450},
	{"Starehe", -1.2830, 36.8230}, {"Mathare", -1.2600, 36.8600},
}

var sites = []struct {
	point
	kind string
}{
	{point{"Kenyatta National Hospital", -1.3008, 36.8070}, "hospital"},
	{point{"Aga Khan University Hospital", -1.2614, 36.8236}, "hospital"},
	{point{"The Nairobi Hospital", -1.2955, 36.8045}, "hospital"},
	{point{"MP Shah Hospital", -1.2638, 36.8136}, "hospital"},
	{point{"Mama Lucy Kibaki Hospital", -1.2786, 36.8995}, "hospital"},
	{point{"Mbagathi County Hospital", -1.3075, 36.8034}, "hospital"},
	{point{"Pumwani Maternity Hospital", -1.2833, 36.8417}, "hospital"},
	{point{"Gertrude's Children's Hospital", -1.2560, 36.8259}, "hospital"},
	{point{"Nairobi School", -1.2588, 36.7675}, "school"},
	{point{"Moi Forces Academy", -1.2722, 36.8599}, "school"},
	{point{"Lenana School", -1.3045, 36.7470}, "school"},
	{point{"Starehe Boys Centre", -1.2793, 36.8382}, "school"},
	{point{"Upper Hill School", -1.2985, 36.8105}, "school"},
	{point{"Olympic Primary School", -1.3146, 36.7868}, "school"},
	{point{"Muthurwa Market", -1.2869, 36.8323}, "market"},
}

var places = []point{
	{"CBD, Moi Avenue", -1.2840, 36.8235}, {"Kibera, Olympic", -1.3150, 36.7875}, {"Kawangware 46", -1.2850, 36.7480},
	{"Eastleigh, 1st Avenue", -1.2740, 36.8510}, {"Westlands, Woodvale Grove", -1.2655, 36.8040},
	{"Kilimani, Argwings Kodhek", -1.2890, 36.7840}, {"South B, Mchumbi Rd", -1.3080, 36.8370},
	{"South C, Muhoho Ave", -1.3180, 36.8250}, {"Embakasi, Fedha", -1.3230, 36.8980}, {"Kasarani, Mwiki Rd", -1.2210, 36.8970},
	{"Githurai 44", -1.2010, 36.9120}, {"Umoja 2", -1.2830, 36.8960}, {"Donholm, Savannah Rd", -1.2960, 36.8880},
	{"Lang'ata, Southlands", -1.3370, 36.7700}, {"Karen, Dagoretti Rd", -1.3190, 36.7100}, {"Parklands, 3rd Avenue", -1.2630, 36.8160},
	{"Ngara, Park Rd", -1.2750, 36.8270}, {"Industrial Area, Lunga Lunga Rd", -1.3070, 36.8500}, {"Mathare North", -1.2600, 36.8590},
	{"Dandora Phase 2", -1.2480, 36.9020}, {"Kayole, Spine Rd", -1.2760, 36.9150}, {"Roysambu, TRM Drive", -1.2180, 36.8870},
	{"Lavington, James Gichuru Rd", -1.2800, 36.7700}, {"Upper Hill, Ralph Bunche Rd", -1.2990, 36.8150},
	{"Buruburu Phase 1", -1.2860, 36.8770}, {"Pipeline, Outer Ring Rd", -1.3170, 36.8960}, {"Kangemi, Waiyaki Way", -1.2660, 36.7470},
	{"Huruma, Juja Rd", -1.2580, 36.8700},
}

var descriptions = map[string][]string{
	"burst_pipe": {"Pipe burst, water is gushing onto the road", "Bomba limepasuka, maji yanamwagika barabarani",
		"Big burst near the junction, water spraying everywhere", "Main pipe broken, flooding the footpath"},
	"pooling": {"Water pooling on the road for days, no clear source", "Maji yamejaa barabarani karibu na stage",
		"Puddle keeps growing outside the shops", "Standing water near the drainage, always wet"},
	"dripping": {"Meter dripping all day", "Mfereji unavuja usiku na mchana", "Communal tap won't close, slow drip",
		"Dripping valve next to the gate"},
	"sewage": {"Sewage overflowing from manhole, bad smell", "Maji taka yanatiririka karibu na shule",
		"Sewer line leaking into the road", "Manhole overflowing after the rains"},
	"other": {"Water coming up from under the pavement", "Not sure what it is but water keeps flowing"},
}

// Seed loads the demo data. It refuses to run against a database that already has a utility.
func Seed(ctx context.Context, store db.Store, reports *report.Service) error {
	n, err := store.CountUtilities(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("seed skipped: data already present")
		return nil
	}
	slog.Info("seeding Nairobi demo data")

	area := map[string]any{"type": "Polygon", "coordinates": [][][2]float64{nairobiArea}}
	areaJSON, _ := json.Marshal(area)
	utilityID, err := store.CreateUtility(ctx, db.CreateUtilityParams{Name: "Nairobi Water (Demo)", AreaGeojson: string(areaJSON)})
	if err != nil {
		return fmt.Errorf("create utility: %w", err)
	}
	settings, _ := json.Marshal(report.DefaultSettings())
	if err := store.SavePrioritySettings(ctx, db.SavePrioritySettingsParams{UtilityID: utilityID, Weights: settings}); err != nil {
		return err
	}
	for _, z := range zones {
		if err := store.CreateZone(ctx, db.CreateZoneParams{UtilityID: utilityID, Name: z.name, Lat: z.lat, Lng: z.lng}); err != nil {
			return fmt.Errorf("create zone %s: %w", z.name, err)
		}
	}
	for _, s := range sites {
		if _, err := store.CreateSensitiveSite(ctx, db.CreateSensitiveSiteParams{UtilityID: &utilityID, Name: s.name, Kind: s.kind, Lat: s.lat, Lng: s.lng}); err != nil {
			return fmt.Errorf("create site %s: %w", s.name, err)
		}
	}

	hash, err := utils.HashPassword(DemoPassword)
	if err != nil {
		return err
	}
	staff := map[string]uuid.UUID{}
	for _, u := range []struct{ email, name, role string }{
		{"admin@flow.local", "Grace Admin", "admin"},
		{"dispatcher@flow.local", "Wanjiku Mwangi", "dispatcher"},
		{"tech1@flow.local", "Otieno Ochieng", "technician"},
		{"tech2@flow.local", "Amina Hassan", "technician"},
		{"tech3@flow.local", "Peter Mwangi", "technician"},
	} {
		params := db.CreateUserParams{Role: u.role, Name: u.name, Email: ptr(u.email), PasswordHash: &hash}
		if u.role != "admin" {
			params.UtilityID = &utilityID
		}
		created, err := store.CreateUser(ctx, params)
		if err != nil {
			return fmt.Errorf("create user %s: %w", u.email, err)
		}
		staff[u.email] = created.ID
	}
	dispatcher := staff["dispatcher@flow.local"]
	techs := []uuid.UUID{staff["tech1@flow.local"], staff["tech2@flow.local"]}

	r := rand.New(rand.NewPCG(2026, 11))
	now := time.Now()
	leakWeights := []struct {
		t string
		w float64
	}{{"burst_pipe", 0.3}, {"pooling", 0.3}, {"dripping", 0.2}, {"sewage", 0.15}, {"other", 0.05}}
	pickLeak := func() string {
		x, acc := r.Float64(), 0.0
		for _, lw := range leakWeights {
			if acc += lw.w; x < acc {
				return lw.t
			}
		}
		return "pooling"
	}

	type made struct {
		id        uuid.UUID
		clusterID uuid.UUID
		created   time.Time
	}
	create := func(p point, leak, size, duration string, created time.Time, jitterM float64) (made, error) {
		lat, lng := jitter(r, p.lat, p.lng, jitterM)
		desc := descriptions[leak][r.IntN(len(descriptions[leak]))]
		var phone *string
		if r.Float64() < 0.6 {
			phone = ptr(fmt.Sprintf("+2547%08d", r.IntN(100000000)))
		}
		locale := "en"
		if r.Float64() < 0.3 {
			locale = "sw"
		}
		var lt, sz, du *string
		// Some citizens skip the optional questions.
		if r.Float64() < 0.85 {
			lt = &leak
		}
		if r.Float64() < 0.8 {
			sz = &size
		}
		if r.Float64() < 0.7 {
			du = &duration
		}
		id, err := store.CreateReport(ctx, db.CreateReportParams{
			ReferenceCode: utils.RandomReferenceCode(), ReporterPhone: phone, Locale: locale, Lat: lat, Lng: lng,
			AddressText: p.name, Description: desc, LeakType: lt, SizeEstimate: sz, Duration: du,
			UtilityID: &utilityID, CreatedAt: &created,
		})
		if err != nil {
			return made{}, err
		}
		if err := store.CreateStatusEvent(ctx, db.CreateStatusEventParams{ReportID: id, ToStatus: report.StatusReceived, CreatedAt: &created}); err != nil {
			return made{}, err
		}
		cid, err := store.CreateClusterForReport(ctx, id)
		if err != nil {
			return made{}, err
		}
		if err := store.MoveReportsToCluster(ctx, db.MoveReportsToClusterParams{ClusterID: cid, ReportIds: []uuid.UUID{id}}); err != nil {
			return made{}, err
		}
		return made{id: id, clusterID: cid, created: created}, nil
	}
	sizes := []string{"small", "medium", "large"}
	durations := []string{"today", "days", "week"}

	var primaries []made
	// 36 standalone reports spread across the city over the last ten days.
	for i := 0; i < 36; i++ {
		p := places[i%len(places)]
		m, err := create(p, pickLeak(), sizes[r.IntN(3)], durations[r.IntN(3)], now.Add(-time.Duration(1+r.IntN(240))*time.Hour), 300)
		if err != nil {
			return fmt.Errorf("create report: %w", err)
		}
		primaries = append(primaries, m)
	}
	// 3 groups that a dispatcher already merged (primary + 1–3 duplicates).
	for g, extra := range []int{3, 2, 1} {
		p := places[(g*7+3)%len(places)]
		leak := []string{"burst_pipe", "sewage", "pooling"}[g]
		start := now.Add(-time.Duration(20+r.IntN(60)) * time.Hour)
		m, err := create(p, leak, "large", "days", start, 50)
		if err != nil {
			return err
		}
		ids := []uuid.UUID{}
		for k := 0; k < extra; k++ {
			d, err := create(point{p.name, latOf(store, ctx, m.id), lngOf(store, ctx, m.id)}, leak, "large", "days",
				start.Add(time.Duration(1+k)*time.Hour), 25)
			if err != nil {
				return err
			}
			ids = append(ids, d.id)
			if err := store.MarkClusterMerged(ctx, d.clusterID); err != nil {
				return err
			}
		}
		if err := store.MoveReportsToCluster(ctx, db.MoveReportsToClusterParams{ClusterID: m.clusterID, ReportIds: ids}); err != nil {
			return err
		}
		if err := store.RefreshCluster(ctx, m.clusterID); err != nil {
			return err
		}
		primaries = append(primaries, m)
	}
	// 4 fresh near-duplicate pairs left unmerged, so the dashboard shows merge suggestions.
	pending := []made{}
	for k := 0; k < 4; k++ {
		p := places[(k*5+1)%len(places)]
		leak := []string{"burst_pipe", "pooling", "dripping", "sewage"}[k]
		start := now.Add(-time.Duration(2+r.IntN(30)) * time.Hour)
		a, err := create(p, leak, "medium", "today", start, 20)
		if err != nil {
			return err
		}
		b, err := create(point{p.name, latOf(store, ctx, a.id), lngOf(store, ctx, a.id)}, leak, "medium", "today", start.Add(90*time.Minute), 20)
		if err != nil {
			return err
		}
		pending = append(pending, a, b)
	}

	// Move older standalone/merged reports along the timeline so the stats and
	// "typical time to fix" have history.
	for i, m := range primaries {
		age := now.Sub(m.created)
		var steps []string
		switch {
		case i%11 == 5:
			steps = []string{report.StatusInvalid}
		case age > 120*time.Hour:
			steps = []string{report.StatusVerified, report.StatusScheduled, report.StatusInProgress, report.StatusFixed}
		case age > 72*time.Hour:
			steps = []string{report.StatusVerified, report.StatusScheduled, report.StatusInProgress}
		case age > 36*time.Hour:
			steps = []string{report.StatusVerified, report.StatusScheduled}
		case age > 12*time.Hour && i%2 == 0:
			steps = []string{report.StatusVerified}
		}
		if err := advance(ctx, store, m.id, m.clusterID, steps, m.created, dispatcher, techs[i%2], r); err != nil {
			return fmt.Errorf("advance report: %w", err)
		}
	}

	// Analyze everything: severity, merge suggestions and priority with reasons.
	all := append(primaries, pending...)
	for _, m := range all {
		if err := reports.Analyze(ctx, m.id); err != nil {
			return fmt.Errorf("analyze %s: %w", m.id, err)
		}
	}
	slog.Info("seed complete", "reports", len(all)+6, "utility_id", utilityID)
	return nil
}

// advance walks a group through statuses with back-dated events.
func advance(ctx context.Context, store db.Store, primaryID, clusterID uuid.UUID, steps []string, created time.Time, dispatcher, tech uuid.UUID, r *rand.Rand) error {
	if len(steps) == 0 {
		return nil
	}
	members, err := store.ListReportsInCluster(ctx, clusterID)
	if err != nil {
		return err
	}
	at := created
	from := report.StatusReceived
	gaps := map[string]time.Duration{
		report.StatusVerified: 2 * time.Hour, report.StatusScheduled: 6 * time.Hour,
		report.StatusInProgress: 18 * time.Hour, report.StatusFixed: 10 * time.Hour, report.StatusInvalid: 3 * time.Hour,
	}
	for _, to := range steps {
		at = at.Add(gaps[to] + time.Duration(r.IntN(240))*time.Minute)
		if at.After(time.Now()) {
			break
		}
		actor := dispatcher
		note := ""
		switch to {
		case report.StatusScheduled:
			due := at.Add(48 * time.Hour)
			if _, err := store.CreateAssignment(ctx, db.CreateAssignmentParams{ReportID: primaryID, TechnicianID: tech, AssignedBy: &dispatcher, DueAt: &due}); err != nil {
				return err
			}
		case report.StatusInProgress, report.StatusFixed:
			actor = tech
		case report.StatusInvalid:
			note = "Crew found a car wash draining onto the road, not a pipe leak."
		}
		var fixedAt *time.Time
		if to == report.StatusFixed {
			fixedAt = ptr(at)
		}
		invalid := ""
		if to == report.StatusInvalid {
			invalid = note
		}
		for _, m := range members {
			if err := store.SetReportStatus(ctx, db.SetReportStatusParams{ID: m.ID, Status: to, FixedAt: fixedAt, InvalidReason: invalid}); err != nil {
				return err
			}
			if err := store.CreateStatusEvent(ctx, db.CreateStatusEventParams{ReportID: m.ID, FromStatus: ptr(from), ToStatus: to,
				ActorID: &actor, Note: note, CreatedAt: &at}); err != nil {
				return err
			}
		}
		from = to
	}
	return store.RefreshCluster(ctx, clusterID)
}

// jitter moves a point up to maxM metres in a random direction.
func jitter(r *rand.Rand, lat, lng, maxM float64) (float64, float64) {
	d := r.Float64() * maxM
	angle := r.Float64() * 2 * math.Pi
	dLat := d * math.Cos(angle) / 111320
	dLng := d * math.Sin(angle) / (111320 * math.Cos(lat*math.Pi/180))
	return lat + dLat, lng + dLng
}

func latOf(store db.Store, ctx context.Context, id uuid.UUID) float64 {
	r, _ := store.GetReport(ctx, id)
	return r.Lat
}

func lngOf(store db.Store, ctx context.Context, id uuid.UUID) float64 {
	r, _ := store.GetReport(ctx, id)
	return r.Lng
}

func ptr[T any](v T) *T { return &v }
