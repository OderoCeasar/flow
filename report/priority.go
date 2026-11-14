package report

import (
	"encoding/json"
	"fmt"
	"math"
	"time"
)

// Weights are the maximum points each factor can add. They live in
// priority_settings so an admin can tune them without a deploy.
type Weights struct {
	Severity      float64 `json:"severity"`
	Duplicates    float64 `json:"duplicates"`
	Age           float64 `json:"age"`
	SensitiveSite float64 `json:"sensitive_site"`
	WaterLoss     float64 `json:"water_loss"`
	MainPipe      float64 `json:"main_pipe"`
}

// Params control how each factor scales and how duplicates are found.
type Params struct {
	SensitiveRadiusM    float64 `json:"sensitive_radius_m"`    // full points at 0 m, none past this
	DuplicateCap        int     `json:"duplicate_cap"`         // this many duplicates earns full points
	AgeCapHours         float64 `json:"age_cap_hours"`         // open this long earns full points
	WaterLossCapLPD     float64 `json:"water_loss_cap_lpd"`    // litres/day for full points
	DuplicateRadiusM    float64 `json:"duplicate_radius_m"`    // duplicate search radius
	DuplicateWindowDays int     `json:"duplicate_window_days"` // duplicate search window
	ReviewConfidence    float64 `json:"review_confidence"`     // AI below this is flagged for review
}

type Settings struct {
	Weights Weights `json:"weights"`
	Params  Params  `json:"params"`
}

func DefaultSettings() Settings {
	return Settings{
		Weights: Weights{Severity: 40, Duplicates: 15, Age: 10, SensitiveSite: 15, WaterLoss: 10, MainPipe: 10},
		Params: Params{
			SensitiveRadiusM: 500, DuplicateCap: 10, AgeCapHours: 168, WaterLossCapLPD: 50000,
			DuplicateRadiusM: 50, DuplicateWindowDays: 7, ReviewConfidence: 0.6,
		},
	}
}

// ParseSettings reads stored settings on top of the defaults, so a setting
// added later never reads as zero.
func ParseSettings(raw json.RawMessage) Settings {
	s := DefaultSettings()
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &s)
	}
	return s
}

// Validate returns field errors keyed like the JSON, or nil.
func (s Settings) Validate() map[string]string {
	errs := map[string]string{}
	for key, w := range map[string]float64{
		"weights.severity": s.Weights.Severity, "weights.duplicates": s.Weights.Duplicates,
		"weights.age": s.Weights.Age, "weights.sensitive_site": s.Weights.SensitiveSite,
		"weights.water_loss": s.Weights.WaterLoss, "weights.main_pipe": s.Weights.MainPipe,
	} {
		if w < 0 || w > 100 {
			errs[key] = "Use a number from 0 to 100."
		}
	}
	p := s.Params
	if p.SensitiveRadiusM < 10 || p.SensitiveRadiusM > 5000 {
		errs["params.sensitive_radius_m"] = "Use a distance from 10 to 5000 metres."
	}
	if p.DuplicateCap < 1 || p.DuplicateCap > 100 {
		errs["params.duplicate_cap"] = "Use a number from 1 to 100."
	}
	if p.AgeCapHours < 1 || p.AgeCapHours > 24*90 {
		errs["params.age_cap_hours"] = "Use a number of hours from 1 to 2160."
	}
	if p.WaterLossCapLPD < 100 {
		errs["params.water_loss_cap_lpd"] = "Use at least 100 litres a day."
	}
	if p.DuplicateRadiusM < 5 || p.DuplicateRadiusM > 500 {
		errs["params.duplicate_radius_m"] = "Use a distance from 5 to 500 metres."
	}
	if p.DuplicateWindowDays < 1 || p.DuplicateWindowDays > 60 {
		errs["params.duplicate_window_days"] = "Use a number of days from 1 to 60."
	}
	if p.ReviewConfidence < 0 || p.ReviewConfidence > 1 {
		errs["params.review_confidence"] = "Use a number from 0 to 1."
	}
	if len(errs) == 0 {
		return nil
	}
	return errs
}

// PriorityInput is everything the formula looks at.
type PriorityInput struct {
	Severity       string
	DuplicateCount int
	OpenedAt       time.Time
	ClosedAt       *time.Time // stops the age clock once fixed
	Now            time.Time
	NearestSite    *NearbySite
	LitresPerHour  float64
	IsMain         bool
	Override       *int
	OverrideReason string
}

type NearbySite struct {
	Name      string  `json:"name"`
	Kind      string  `json:"kind"`
	DistanceM float64 `json:"distance_m"`
}

// PriorityItem is one line of the explanation shown to dispatchers, such as
// "Burst main +10". Key and Params let the UI translate the label.
type PriorityItem struct {
	Key    string         `json:"key"`
	Label  string         `json:"label"`
	Points int            `json:"points"`
	Params map[string]any `json:"params,omitempty"`
}

var severityFactor = map[string]float64{"low": 0.25, "medium": 0.5, "high": 0.75, "critical": 1}

// ComputePriority is a plain weighted sum, clamped to 0–100. Each factor's
// points are rounded first so the explanation always adds up to the score.
func ComputePriority(in PriorityInput, s Settings) (int, []PriorityItem) {
	w, p := s.Weights, s.Params
	items := []PriorityItem{}
	add := func(key, label string, raw float64, params map[string]any) {
		pts := int(math.Round(raw))
		if pts != 0 || key == "severity" {
			items = append(items, PriorityItem{Key: key, Label: label, Points: pts, Params: params})
		}
	}

	sev := in.Severity
	factor, ok := severityFactor[sev]
	if !ok {
		sev, factor = "unknown", 0.4
	}
	add("severity", "Severity: "+sev, w.Severity*factor, map[string]any{"severity": sev})

	if in.IsMain {
		add("main_pipe", "Burst main", w.MainPipe, nil)
	}

	if in.DuplicateCount > 0 && p.DuplicateCap > 0 {
		n := min(in.DuplicateCount, p.DuplicateCap)
		label := fmt.Sprintf("%d duplicate reports", in.DuplicateCount)
		if in.DuplicateCount == 1 {
			label = "1 duplicate report"
		}
		add("duplicates", label, w.Duplicates*float64(n)/float64(p.DuplicateCap), map[string]any{"count": in.DuplicateCount})
	}

	end := in.Now
	if in.ClosedAt != nil {
		end = *in.ClosedAt
	}
	hours := math.Max(0, end.Sub(in.OpenedAt).Hours())
	if p.AgeCapHours > 0 {
		add("age", "Open "+humanHours(hours), w.Age*math.Min(hours/p.AgeCapHours, 1), map[string]any{"hours": math.Round(hours)})
	}

	if site := in.NearestSite; site != nil && p.SensitiveRadiusM > 0 && site.DistanceM <= p.SensitiveRadiusM {
		add("sensitive_site", fmt.Sprintf("Near %s (%d m)", site.Name, int(math.Round(site.DistanceM))),
			w.SensitiveSite*(1-site.DistanceM/p.SensitiveRadiusM),
			map[string]any{"name": site.Name, "kind": site.Kind, "distance_m": math.Round(site.DistanceM)})
	}

	if lpd := in.LitresPerHour * 24; lpd > 0 && p.WaterLossCapLPD > 0 {
		add("water_loss", fmt.Sprintf("About %s litres lost a day", groupThousands(int(math.Round(lpd)))),
			w.WaterLoss*math.Min(lpd/p.WaterLossCapLPD, 1), map[string]any{"litres_per_day": math.Round(lpd)})
	}

	score := 0
	for _, it := range items {
		score += it.Points
	}
	if score > 100 {
		items = append(items, PriorityItem{Key: "cap", Label: "Capped at 100", Points: 100 - score})
		score = 100
	}
	if score < 0 {
		score = 0
	}

	if in.Override != nil {
		o := max(0, min(100, *in.Override))
		items = append(items, PriorityItem{
			Key: "override", Label: "Dispatcher override: " + in.OverrideReason, Points: o - score,
			Params: map[string]any{"value": o, "reason": in.OverrideReason},
		})
		score = o
	}
	return score, items
}

func humanHours(h float64) string {
	switch {
	case h < 1:
		return "less than an hour"
	case h < 48:
		n := int(h)
		if n == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", n)
	default:
		return fmt.Sprintf("%d days", int(h/24))
	}
}

func groupThousands(n int) string {
	s := fmt.Sprintf("%d", n)
	out := []byte{}
	for i := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, s[i])
	}
	return string(out)
}
