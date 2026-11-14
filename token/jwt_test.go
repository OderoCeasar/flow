package token

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestJWTMakerRoundTrip(t *testing.T) {
	maker, err := NewJWTMaker("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatal(err)
	}
	userID, utilityID := uuid.New(), uuid.New()
	tok, _, err := maker.CreateToken(userID, "dispatcher", &utilityID, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	p, err := maker.VerifyToken(tok)
	if err != nil {
		t.Fatal(err)
	}
	if p.UserID != userID || p.Role != "dispatcher" || p.UtilityID == nil || *p.UtilityID != utilityID {
		t.Fatalf("payload mismatch: %+v", p)
	}
}

func TestJWTMakerRejectsExpiredAndForeignTokens(t *testing.T) {
	maker, _ := NewJWTMaker("0123456789abcdef0123456789abcdef")
	tok, _, _ := maker.CreateToken(uuid.New(), "citizen", nil, -time.Minute)
	if _, err := maker.VerifyToken(tok); err != ErrExpiredToken {
		t.Fatalf("want ErrExpiredToken, got %v", err)
	}
	other, _ := NewJWTMaker("ffffffffffffffffffffffffffffffff")
	tok, _, _ = other.CreateToken(uuid.New(), "admin", nil, time.Minute)
	if _, err := maker.VerifyToken(tok); err != ErrInvalidToken {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}
