package report

import (
	"testing"
	"time"
)

func TestComputePriority(t *testing.T) {
	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	s := DefaultSettings()

	tests := []struct {
		name      string
		in        PriorityInput
		wantScore int
		wantKeys  map[string]int // key -> points
	}{
		{
			name:      "fresh low drip scores severity only",
			in:        PriorityInput{Severity: "low", OpenedAt: now, Now: now, LitresPerHour: 5},
			wantScore: 10,
			wantKeys:  map[string]int{"severity": 10},
		},
		{
			name: "critical burst main near a hospital with duplicates",
			in: PriorityInput{
				Severity: "critical", IsMain: true, DuplicateCount: 12,
				OpenedAt: now.Add(-84 * time.Hour), Now: now,
				NearestSite:   &NearbySite{Name: "Kenyatta National Hospital", Kind: "hospital", DistanceM: 0},
				LitresPerHour: 8000,
			},
			// 40 + 10 + 15 (capped dups) + 5 (half the age cap) + 15 + 10 = 95
			wantScore: 95,
			wantKeys:  map[string]int{"severity": 40, "main_pipe": 10, "duplicates": 15, "age": 5, "sensitive_site": 15, "water_loss": 10},
		},
		{
			name: "site past the radius adds nothing",
			in: PriorityInput{Severity: "medium", OpenedAt: now, Now: now,
				NearestSite: &NearbySite{Name: "School", DistanceM: 600}},
			wantScore: 20,
			wantKeys:  map[string]int{"severity": 20},
		},
		{
			name:      "site halfway into the radius earns half points",
			in:        PriorityInput{Severity: "medium", OpenedAt: now, Now: now, NearestSite: &NearbySite{Name: "School", DistanceM: 250}},
			wantScore: 28, // 20 + round(7.5)=8
			wantKeys:  map[string]int{"severity": 20, "sensitive_site": 8},
		},
		{
			name:      "unknown severity gets a middle factor",
			in:        PriorityInput{Severity: "", OpenedAt: now, Now: now},
			wantScore: 16,
			wantKeys:  map[string]int{"severity": 16},
		},
		{
			name: "age clock stops when fixed",
			in: PriorityInput{Severity: "low", OpenedAt: now.Add(-400 * time.Hour), Now: now,
				ClosedAt: ptr(now.Add(-316 * time.Hour))}, // open 84h
			wantScore: 15,
			wantKeys:  map[string]int{"severity": 10, "age": 5},
		},
		{
			name: "override replaces the score and explains the gap",
			in: PriorityInput{Severity: "low", OpenedAt: now, Now: now,
				Override: ptr(90), OverrideReason: "Flooding a clinic entrance"},
			wantScore: 90,
			wantKeys:  map[string]int{"severity": 10, "override": 80},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score, items := ComputePriority(tt.in, s)
			if score != tt.wantScore {
				t.Errorf("score = %d, want %d (items %+v)", score, tt.wantScore, items)
			}
			got := map[string]int{}
			sum := 0
			for _, it := range items {
				got[it.Key] = it.Points
				sum += it.Points
				if it.Label == "" {
					t.Errorf("item %q has no label", it.Key)
				}
			}
			if sum != score {
				t.Errorf("breakdown sums to %d, score is %d", sum, score)
			}
			for k, v := range tt.wantKeys {
				if got[k] != v {
					t.Errorf("%s = %d, want %d", k, got[k], v)
				}
			}
			if len(got) != len(tt.wantKeys) {
				t.Errorf("items = %v, want keys %v", got, tt.wantKeys)
			}
		})
	}
}

func TestComputePriorityCapsAt100(t *testing.T) {
	now := time.Now()
	s := DefaultSettings()
	s.Weights.Severity = 100
	score, items := ComputePriority(PriorityInput{Severity: "critical", IsMain: true, OpenedAt: now, Now: now}, s)
	if score != 100 {
		t.Fatalf("score = %d, want 100", score)
	}
	sum := 0
	for _, it := range items {
		sum += it.Points
	}
	if sum != 100 {
		t.Fatalf("breakdown sums to %d", sum)
	}
}

func TestDeriveSeverity(t *testing.T) {
	tests := []struct {
		leak, size string
		notLeak    bool
		want       string
	}{
		{"burst_pipe", "large", false, "critical"},
		{"burst_pipe", "medium", false, "high"},
		{"burst_pipe", "", false, "high"},
		{"sewage", "small", false, "medium"},
		{"pooling", "large", false, "high"},
		{"pooling", "small", false, "medium"},
		{"dripping", "small", false, "low"},
		{"dripping", "large", false, "medium"},
		{"", "", false, "low"},
		{"burst_pipe", "large", true, "low"},
	}
	for _, tt := range tests {
		if got := DeriveSeverity(optional(tt.leak), optional(tt.size), tt.notLeak); got != tt.want {
			t.Errorf("DeriveSeverity(%q, %q, %v) = %q, want %q", tt.leak, tt.size, tt.notLeak, got, tt.want)
		}
	}
}

func TestTechnicianCanMove(t *testing.T) {
	if !TechnicianCanMove(StatusScheduled, StatusInProgress) || !TechnicianCanMove(StatusInProgress, StatusFixed) {
		t.Fatal("technician should start and finish work")
	}
	if TechnicianCanMove(StatusReceived, StatusFixed) || TechnicianCanMove(StatusFixed, StatusInvalid) {
		t.Fatal("technician must not skip steps or invalidate")
	}
}

func TestSettingsValidate(t *testing.T) {
	if errs := DefaultSettings().Validate(); errs != nil {
		t.Fatalf("defaults invalid: %v", errs)
	}
	s := DefaultSettings()
	s.Weights.Age = 150
	s.Params.DuplicateRadiusM = 1
	errs := s.Validate()
	if errs["weights.age"] == "" || errs["params.duplicate_radius_m"] == "" {
		t.Fatalf("expected field errors, got %v", errs)
	}
}
