package token

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Different types of error returned by the VerifyToken function
var (
	ErrInvalidToken = errors.New("token is invalid")
	ErrExpiredToken = errors.New("token has expired")
)

// Payload contains the payload data of the token
type Payload struct {
	ID        uuid.UUID  `json:"id"`
	UserID    uuid.UUID  `json:"user_id"`
	Role      string     `json:"role"`
	UtilityID *uuid.UUID `json:"utility_id,omitempty"`
	IssuedAt  time.Time  `json:"issued_at"`
	ExpiredAt time.Time  `json:"expired_at"`
}

// NewPayload creates a new token payload for a user and duration
func NewPayload(userID uuid.UUID, role string, utilityID *uuid.UUID, duration time.Duration) *Payload {
	now := time.Now()
	return &Payload{
		ID:        uuid.New(),
		UserID:    userID,
		Role:      role,
		UtilityID: utilityID,
		IssuedAt:  now,
		ExpiredAt: now.Add(duration),
	}
}

// jwtClaims maps a Payload onto registered JWT claims.
type jwtClaims struct {
	Role      string `json:"role"`
	UtilityID string `json:"utility_id,omitempty"`
	jwt.RegisteredClaims
}
