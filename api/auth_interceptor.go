package api

import (
	"net/http"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"

	"flow/apperr"
	"flow/report"
	"flow/token"
)

const (
	accessCookie  = "flow_access"
	refreshCookie = "flow_refresh"
	payloadKey    = "auth_payload"
)

// optionalAuth reads the access token (cookie first, then a Bearer header for
// API clients) and stores the payload when it is valid. Public routes keep
// working without it; requireRoles enforces it.
func (server *Server) optionalAuth() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		raw, _ := ctx.Cookie(accessCookie)
		if raw == "" {
			if h := ctx.GetHeader("Authorization"); strings.HasPrefix(strings.ToLower(h), "bearer ") {
				raw = strings.TrimSpace(h[7:])
			}
		}
		if raw != "" {
			if payload, err := server.tokenMaker.VerifyToken(raw); err == nil {
				ctx.Set(payloadKey, payload)
			}
		}
		ctx.Next()
	}
}

// requireRoles rejects requests without a valid token, or whose role is not
// listed. With no roles listed, any signed-in user passes. Services check
// again (utility scoping), so this is the first of two locks.
func (server *Server) requireRoles(roles ...string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		payload := authPayload(ctx)
		if payload == nil {
			respondError(ctx, apperr.New(http.StatusUnauthorized, "unauthorized", "Please sign in to continue."))
			return
		}
		if len(roles) > 0 && !slices.Contains(roles, payload.Role) {
			respondError(ctx, apperr.Forbidden())
			return
		}
		ctx.Next()
	}
}

func authPayload(ctx *gin.Context) *token.Payload {
	v, ok := ctx.Get(payloadKey)
	if !ok {
		return nil
	}
	p, _ := v.(*token.Payload)
	return p
}

func actorFrom(ctx *gin.Context) report.Actor {
	p := authPayload(ctx)
	if p == nil {
		return report.Actor{}
	}
	return report.Actor{UserID: p.UserID, Role: p.Role, UtilityID: p.UtilityID}
}
