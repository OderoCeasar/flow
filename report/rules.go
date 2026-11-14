package report

import (
	"slices"
)

// Statuses, in the order a report moves through them. Use these exact words
// everywhere ("Fixed", never "Resolved" or "Closed").
const (
	StatusReceived   = "received"
	StatusVerified   = "verified"
	StatusScheduled  = "scheduled"
	StatusInProgress = "in_progress"
	StatusFixed      = "fixed"
	StatusInvalid    = "invalid"
)

var Statuses = []string{StatusReceived, StatusVerified, StatusScheduled, StatusInProgress, StatusFixed, StatusInvalid}

var (
	LeakTypes  = []string{"burst_pipe", "pooling", "dripping", "sewage", "other"}
	Sizes      = []string{"small", "medium", "large"}
	Durations  = []string{"today", "days", "week"}
	Severities = []string{"low", "medium", "high", "critical"}
	SiteKinds  = []string{"hospital", "school", "clinic", "market", "other"}
)

func IsOpen(status string) bool { return status != StatusFixed && status != StatusInvalid }

// technicianMoves are the only status changes a field technician may make.
// Dispatchers may set any status (so they can correct mistakes and undo).
var technicianMoves = map[string][]string{
	StatusVerified:   {StatusInProgress},
	StatusScheduled:  {StatusInProgress},
	StatusInProgress: {StatusFixed},
}

func TechnicianCanMove(from, to string) bool {
	return slices.Contains(technicianMoves[from], to)
}

// DeriveSeverity scores leak type and size into a severity. An AI "not a leak"
// verdict caps severity at low; a human reviews those anyway.
func DeriveSeverity(leakType, size *string, aiNotALeak bool) string {
	if aiNotALeak {
		return "low"
	}
	score := 1
	if leakType != nil {
		switch *leakType {
		case "burst_pipe", "sewage":
			score = 3
		case "pooling":
			score = 2
		}
	}
	switch deref(size) {
	case "medium":
		score++
	case "large":
		score += 2
	case "":
		// Unknown size: assume a modest flow rather than the best case.
		if score >= 2 {
			score++
		}
	}
	switch {
	case score >= 5:
		return "critical"
	case score == 4:
		return "high"
	case score >= 2:
		return "medium"
	default:
		return "low"
	}
}

// InferIsMain guesses whether a leak is on a distribution main. Only a large
// burst is treated as one; dispatchers can correct it.
func InferIsMain(leakType, size *string) bool {
	return deref(leakType) == "burst_pipe" && deref(size) == "large"
}

// litresPerHour is a rough loss rate by leak type and size, based on typical
// figures for urban networks. Sewage is not counted as lost clean water.
var litresPerHour = map[string]map[string]float64{
	"burst_pipe": {"small": 500, "medium": 2000, "large": 8000},
	"pooling":    {"small": 100, "medium": 400, "large": 1500},
	"dripping":   {"small": 5, "medium": 20, "large": 60},
	"other":      {"small": 50, "medium": 200, "large": 800},
}

// LitresPerHour estimates the loss rate. Unknown sizes count as medium.
func LitresPerHour(leakType, size *string) float64 {
	t := deref(leakType)
	if t == "" {
		t = "other"
	}
	rates, ok := litresPerHour[t]
	if !ok {
		return 0
	}
	s := deref(size)
	if s == "" {
		s = "medium"
	}
	return rates[s]
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptr[T any](v T) *T { return &v }

// optional returns nil for empty strings so blank form fields store as NULL.
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
