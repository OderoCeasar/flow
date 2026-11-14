package ai

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"math/rand/v2"
	"sort"
	"strings"
)

// StubImage returns plausible random labels. The same photo always gets the
// same answer, which keeps tests and demos stable.
type StubImage struct{}

func (StubImage) ClassifyImage(_ context.Context, img []byte, _ string) (ImageResult, error) {
	sum := sha256.Sum256(img)
	r := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(sum[:8]), binary.LittleEndian.Uint64(sum[8:16])))

	// Real-world mix: most photos are genuine leaks, a few are not.
	weights := map[string]float64{
		LabelBurstPipe: 0.30, LabelPooling: 0.30, LabelDripping: 0.20, LabelSewage: 0.12, LabelNotALeak: 0.08,
	}
	pick := r.Float64()
	top := LabelPooling
	acc := 0.0
	for _, l := range ImageLabels {
		acc += weights[l]
		if pick < acc {
			top = l
			break
		}
	}
	topConf := 0.45 + r.Float64()*0.5 // 0.45–0.95, so some photos land below the review threshold
	rest := 1 - topConf
	labels := []Label{{Label: top, Confidence: round2(topConf)}}
	others := []string{}
	for _, l := range ImageLabels {
		if l != top {
			others = append(others, l)
		}
	}
	for i, l := range others {
		share := rest / float64(len(others)-i) * (0.5 + r.Float64())
		if i == len(others)-1 || share > rest {
			share = rest
		}
		rest -= share
		labels = append(labels, Label{Label: l, Confidence: round2(share)})
	}
	sort.Slice(labels, func(i, j int) bool { return labels[i].Confidence > labels[j].Confidence })
	return ImageResult{Top: labels[0], Labels: labels, Model: "stub"}, nil
}

func round2(f float64) float64 { return float64(int(f*100+0.5)) / 100 }

// KeywordText pulls leak type and size from free text with simple English and
// Swahili keyword rules. It is fast, free and good enough for an MVP.
type KeywordText struct{}

var typeKeywords = []struct {
	leakType string
	words    []string
}{
	{"sewage", []string{"sewage", "sewer", "toilet", "smell", "stink", "manhole", "maji taka", "choo", "harufu"}},
	{"burst_pipe", []string{"burst", "gushing", "gush", "spraying", "fountain", "broken pipe", "main", "imepasuka", "kupasuka", "bomba kubwa"}},
	{"dripping", []string{"drip", "dripping", "tap", "meter", "faucet", "mita", "mfereji", "inadondoka", "kudondoka"}},
	{"pooling", []string{"pool", "pooling", "puddle", "flood", "flooding", "standing water", "wet", "road", "bwawa", "mafuriko", "maji yamejaa", "barabara"}},
}

var sizeKeywords = []struct {
	size  string
	words []string
}{
	{"large", []string{"huge", "massive", "gushing", "flood", "flooding", "big", "a lot", "everywhere", "kubwa", "mengi", "mafuriko"}},
	{"small", []string{"small", "little", "drip", "dripping", "slow", "trickle", "kidogo", "inadondoka"}},
	{"medium", []string{"steady", "flowing", "running", "medium", "yanatiririka", "wastani"}},
}

func (KeywordText) ClassifyText(_ context.Context, text string) (TextResult, error) {
	t := " " + strings.ToLower(text) + " "
	res := TextResult{Model: "keyword"}
	hits := 0
	for _, k := range typeKeywords {
		if containsAny(t, k.words) {
			res.LeakType = k.leakType
			hits++
			break
		}
	}
	for _, k := range sizeKeywords {
		if containsAny(t, k.words) {
			res.Size = k.size
			hits++
			break
		}
	}
	switch hits {
	case 2:
		res.Confidence = 0.75
	case 1:
		res.Confidence = 0.55
	}
	return res, nil
}

func containsAny(s string, words []string) bool {
	for _, w := range words {
		if strings.Contains(s, w) {
			return true
		}
	}
	return false
}
