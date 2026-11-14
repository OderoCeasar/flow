package utils

import (
	"errors"
	"strings"
)

var ErrInvalidPhone = errors.New("invalid phone number")

// NormalizeKenyanPhone turns the common ways people type a Kenyan mobile number
// (0712 345 678, 712345678, 254712345678, +254-712-345-678) into +254712345678.
func NormalizeKenyanPhone(in string) (string, error) {
	var b strings.Builder
	for _, r := range in {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		} else if r == '+' && b.Len() == 0 {
			continue
		} else if r != ' ' && r != '-' && r != '(' && r != ')' && r != '.' {
			return "", ErrInvalidPhone
		}
	}
	d := b.String()
	switch {
	case strings.HasPrefix(d, "254") && len(d) == 12:
		d = d[3:]
	case strings.HasPrefix(d, "0") && len(d) == 10:
		d = d[1:]
	case len(d) == 9:
	default:
		return "", ErrInvalidPhone
	}
	// Kenyan mobile numbers start with 7 (Safaricom, Airtel, Telkom) or 1 (newer ranges).
	if d[0] != '7' && d[0] != '1' {
		return "", ErrInvalidPhone
	}
	return "+254" + d, nil
}
