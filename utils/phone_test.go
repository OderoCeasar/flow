package utils

import "testing"

func TestNormalizeKenyanPhone(t *testing.T) {
	tests := []struct {
		in, want string
		ok       bool
	}{
		{"0712345678", "+254712345678", true},
		{"0712 345 678", "+254712345678", true},
		{"712345678", "+254712345678", true},
		{"254712345678", "+254712345678", true},
		{"+254-712-345-678", "+254712345678", true},
		{"0110345678", "+254110345678", true},
		{"0212345678", "", false},
		{"12345", "", false},
		{"07123abc78", "", false},
	}
	for _, tt := range tests {
		got, err := NormalizeKenyanPhone(tt.in)
		if (err == nil) != tt.ok || got != tt.want {
			t.Errorf("NormalizeKenyanPhone(%q) = %q, %v; want %q ok=%v", tt.in, got, err, tt.want, tt.ok)
		}
	}
}

func TestRandomReferenceCode(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		c := RandomReferenceCode()
		if len(c) != 10 || c[:4] != "FLW-" {
			t.Fatalf("bad code %q", c)
		}
		seen[c] = true
	}
	if len(seen) < 990 {
		t.Fatalf("too many collisions: %d unique of 1000", len(seen))
	}
}
