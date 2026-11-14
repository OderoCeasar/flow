package api

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"flow/account"
	"flow/admin"
	"flow/apperr"
	"flow/config"
	db "flow/db/sqlc"
	"flow/report"
	"flow/token"
)

// Server serves HTTP requests for Flow.
type Server struct {
	config     config.Config
	store      db.Store
	tokenMaker token.Maker
	router     *gin.Engine
	accounts   *account.Service
	reports    *report.Service
	admin      *admin.Service
	// Limiters for the unauthenticated endpoints that cost money (SMS) or
	// invite spam (report submission).
	reportLimiter   *rateLimiter
	otpIPLimiter    *rateLimiter
	otpPhoneLimiter *rateLimiter
	loginLimiter    *rateLimiter
}

// NewServer creates a new HTTP server and sets up routing.
func NewServer(cfg config.Config, store db.Store, tokenMaker token.Maker, accounts *account.Service, reports *report.Service, adminSvc *admin.Service) *Server {
	server := &Server{
		config:     cfg,
		store:      store,
		tokenMaker: tokenMaker,
		accounts:   accounts,
		reports:    reports,
		admin:      adminSvc,
		// 10 reports an hour per IP, bursting to 5.
		reportLimiter: newRateLimiter(10, 5),
		// 10 code requests an hour per IP, and 3 per phone number.
		otpIPLimiter:    newRateLimiter(10, 5),
		otpPhoneLimiter: newRateLimiter(3, 3),
		loginLimiter:    newRateLimiter(30, 10),
	}
	server.setupRouter()
	return server
}

// Start runs the HTTP server on a specific address.
func (server *Server) Start(address string) error {
	return server.router.Run(address)
}

func (server *Server) Handler() http.Handler {
	return server.router
}

// internalErrorMessage is the one shared message for unexpected errors. Every
// other error carries its own message written where it is raised.
const internalErrorMessage = "Something went wrong on our end. Please try again in a moment."

type errorBody struct {
	Error *apperr.Error `json:"error"`
}

// respondError sends the shared error shape:
// { "error": { "code": "...", "message": "...", "fields": {...} } }.
// Unknown errors are logged and replaced by a generic message, so internal
// details never reach the client.
func respondError(ctx *gin.Context, err error) {
	if e, ok := apperr.As(err); ok {
		if e.Status >= 500 {
			slog.ErrorContext(ctx, "request failed", "path", ctx.FullPath(), "code", e.Code, "err", err)
		}
		ctx.AbortWithStatusJSON(e.Status, errorBody{Error: e})
		return
	}
	slog.ErrorContext(ctx, "request failed", "path", ctx.FullPath(), "err", err)
	ctx.AbortWithStatusJSON(http.StatusInternalServerError, errorBody{Error: &apperr.Error{Code: "internal", Message: internalErrorMessage}})
}

func badRequest(message string) error {
	return apperr.New(http.StatusBadRequest, "bad_request", message)
}
