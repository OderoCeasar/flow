package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

// Claude classifies leak photos and descriptions with a hosted Claude model.
// It uses structured outputs so the reply always matches our JSON schema.
type Claude struct {
	client anthropic.Client
	model  string
}

func NewClaude(apiKey, model string) *Claude {
	return &Claude{
		client: anthropic.NewClient(option.WithAPIKey(apiKey), option.WithRequestTimeout(60*time.Second)),
		model:  model,
	}
}

const imagePrompt = `You help a water utility in Nairobi sort photos that citizens send in.
Look at the photo and pick the one label that best describes it:
- burst_pipe: a broken pipe or main with water gushing or spraying out
- dripping: a dripping tap, valve or water meter
- pooling: water collecting on the ground or road with no clear source
- sewage: sewage, dirty water or an overflowing manhole
- not_a_leak: the photo does not show a water leak
Give your confidence from 0 to 1 and a short reason (one sentence) a dispatcher can read.`

var imageSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"label":      map[string]any{"type": "string", "enum": ImageLabels},
		"confidence": map[string]any{"type": "number"},
		"reason":     map[string]any{"type": "string"},
	},
	"required":             []string{"label", "confidence", "reason"},
	"additionalProperties": false,
}

func (c *Claude) ClassifyImage(ctx context.Context, img []byte, contentType string) (ImageResult, error) {
	media := anthropic.BetaBase64ImageSourceMediaType(contentType)
	if !strings.HasPrefix(contentType, "image/") {
		media = "image/jpeg"
	}
	var out struct {
		Label      string  `json:"label"`
		Confidence float64 `json:"confidence"`
		Reason     string  `json:"reason"`
	}
	err := c.ask(ctx, imageSchema, &out,
		anthropic.NewBetaImageBlock(anthropic.BetaBase64ImageSourceParam{
			Data:      base64.StdEncoding.EncodeToString(img),
			MediaType: media,
		}),
		anthropic.NewBetaTextBlock(imagePrompt),
	)
	if err != nil {
		return ImageResult{}, err
	}
	top := Label{Label: out.Label, Confidence: clamp01(out.Confidence)}
	return ImageResult{Top: top, Labels: []Label{top}, Reason: out.Reason, Model: c.model}, nil
}

const textPrompt = `A citizen in Nairobi described a water problem (the text may be English, Swahili or Sheng).
Work out the leak type (burst_pipe, dripping, pooling, sewage, other, or "" if you can't tell)
and the size (small, medium, large, or "" if you can't tell). Give your confidence from 0 to 1.

Description:
`

var textSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"leak_type":  map[string]any{"type": "string", "enum": []string{"burst_pipe", "dripping", "pooling", "sewage", "other", ""}},
		"size":       map[string]any{"type": "string", "enum": []string{"small", "medium", "large", ""}},
		"confidence": map[string]any{"type": "number"},
	},
	"required":             []string{"leak_type", "size", "confidence"},
	"additionalProperties": false,
}

func (c *Claude) ClassifyText(ctx context.Context, text string) (TextResult, error) {
	var out TextResult
	if err := c.ask(ctx, textSchema, &out, anthropic.NewBetaTextBlock(textPrompt+text)); err != nil {
		return TextResult{}, err
	}
	out.Confidence = clamp01(out.Confidence)
	out.Model = c.model
	return out, nil
}

// ask sends one request and decodes the structured JSON reply into out.
func (c *Claude) ask(ctx context.Context, schema map[string]any, out any, blocks ...anthropic.BetaContentBlockParamUnion) error {
	msg, err := c.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     c.model,
		MaxTokens: 1024,
		Messages:  []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(blocks...)},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Effort: anthropic.BetaOutputConfigEffortLow,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: schema},
		},
		// If a safety classifier declines, let the API retry on a suitable model.
		Fallbacks: anthropic.BetaFallbacksParamOfDefault(),
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	})
	if err != nil {
		var apiErr *anthropic.Error
		if errors.As(err, &apiErr) {
			return fmt.Errorf("claude api status %d: %w", apiErr.StatusCode, err)
		}
		return fmt.Errorf("claude request: %w", err)
	}
	if msg.StopReason == anthropic.BetaStopReasonRefusal {
		return errors.New("claude declined to classify this input")
	}
	for _, block := range msg.Content {
		if t, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			return json.Unmarshal([]byte(t.Text), out)
		}
	}
	return errors.New("claude reply had no text")
}

func clamp01(f float64) float64 {
	if f < 0 {
		return 0
	}
	if f > 1 {
		return 1
	}
	return f
}
