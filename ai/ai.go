// Package ai holds the swappable classifiers. Every piece sits behind an
// interface so it can be replaced with another provider or switched off.
package ai

import "context"

// Image labels. These match the leak types the citizen can pick, plus "not_a_leak".
const (
	LabelBurstPipe = "burst_pipe"
	LabelDripping  = "dripping"
	LabelPooling   = "pooling"
	LabelSewage    = "sewage"
	LabelNotALeak  = "not_a_leak"
)

var ImageLabels = []string{LabelBurstPipe, LabelDripping, LabelPooling, LabelSewage, LabelNotALeak}

type Label struct {
	Label      string  `json:"label"`
	Confidence float64 `json:"confidence"`
}

type ImageResult struct {
	Top    Label   `json:"top"`
	Labels []Label `json:"labels"`
	Reason string  `json:"reason,omitempty"`
	Model  string  `json:"model"`
}

type ImageClassifier interface {
	ClassifyImage(ctx context.Context, img []byte, contentType string) (ImageResult, error)
}

type TextResult struct {
	LeakType   string  `json:"leak_type,omitempty"` // empty when unknown
	Size       string  `json:"size,omitempty"`      // small | medium | large | empty
	Confidence float64 `json:"confidence"`
	Model      string  `json:"model"`
}

type TextClassifier interface {
	ClassifyText(ctx context.Context, text string) (TextResult, error)
}

// Off is used when a classifier is turned off. It returns empty results.
type Off struct{}

func (Off) ClassifyImage(context.Context, []byte, string) (ImageResult, error) {
	return ImageResult{Model: "off"}, nil
}

func (Off) ClassifyText(context.Context, string) (TextResult, error) {
	return TextResult{Model: "off"}, nil
}
