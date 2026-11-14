package token

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const issuer = "flow"

// JWTMaker is a JSON Web Token maker (HS256)
type JWTMaker struct {
	secretKey []byte
}

// NewJWTMaker creates a new JWTMaker
func NewJWTMaker(secretKey string) (Maker, error) {
	if len(secretKey) < 32 {
		return nil, fmt.Errorf("invalid key size: must be at least 32 characters")
	}
	return &JWTMaker{secretKey: []byte(secretKey)}, nil
}

func (maker *JWTMaker) CreateToken(userID uuid.UUID, role string, utilityID *uuid.UUID, duration time.Duration) (string, *Payload, error) {
	payload := NewPayload(userID, role, utilityID, duration)
	claims := jwtClaims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        payload.ID.String(),
			Subject:   userID.String(),
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(payload.IssuedAt),
			ExpiresAt: jwt.NewNumericDate(payload.ExpiredAt),
		},
	}
	if utilityID != nil {
		claims.UtilityID = utilityID.String()
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(maker.secretKey)
	return token, payload, err
}

func (maker *JWTMaker) VerifyToken(token string) (*Payload, error) {
	claims := &jwtClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		return maker.secretKey, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer(issuer), jwt.WithExpirationRequired())
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}
	userID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return nil, ErrInvalidToken
	}
	id, _ := uuid.Parse(claims.ID)
	payload := &Payload{ID: id, UserID: userID, Role: claims.Role,
		IssuedAt: claims.IssuedAt.Time, ExpiredAt: claims.ExpiresAt.Time}
	if claims.UtilityID != "" {
		u, err := uuid.Parse(claims.UtilityID)
		if err != nil {
			return nil, ErrInvalidToken
		}
		payload.UtilityID = &u
	}
	return payload, nil
}
