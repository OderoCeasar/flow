package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"flow/account"
	"flow/apperr"
	"flow/utils"
)

type otpRequest struct {
	Phone  string `json:"phone" binding:"required"`
	Locale string `json:"locale"`
}

func (server *Server) requestOTP(ctx *gin.Context) {
	var req otpRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		respondError(ctx, apperr.Validation(map[string]string{"phone": "Enter your mobile number."}))
		return
	}
	// Per-phone limit as well as per-IP, so one number can't be flooded with codes.
	if phone, err := utils.NormalizeKenyanPhone(req.Phone); err == nil && !server.otpPhoneLimiter.Allow(phone) {
		respondError(ctx, apperr.RateLimited())
		return
	}
	res, err := server.accounts.RequestOTP(ctx, req.Phone, req.Locale)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, res)
}

type otpVerifyRequest struct {
	Phone string `json:"phone" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

func (server *Server) verifyOTP(ctx *gin.Context) {
	var req otpVerifyRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		respondError(ctx, apperr.Validation(map[string]string{"code": "Enter the 6-digit code from the SMS."}))
		return
	}
	session, err := server.accounts.VerifyOTP(ctx, req.Phone, req.Code)
	if err != nil {
		respondError(ctx, err)
		return
	}
	server.setSessionCookies(ctx, session)
	ctx.JSON(http.StatusOK, gin.H{"user": session.User})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (server *Server) login(ctx *gin.Context) {
	var req loginRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		respondError(ctx, apperr.Validation(map[string]string{"email": "Enter your email and password."}))
		return
	}
	session, err := server.accounts.Login(ctx, req.Email, req.Password)
	if err != nil {
		respondError(ctx, err)
		return
	}
	server.setSessionCookies(ctx, session)
	ctx.JSON(http.StatusOK, gin.H{"user": session.User})
}

func (server *Server) refresh(ctx *gin.Context) {
	raw, _ := ctx.Cookie(refreshCookie)
	session, err := server.accounts.Refresh(ctx, raw)
	if err != nil {
		server.clearSessionCookies(ctx)
		respondError(ctx, err)
		return
	}
	server.setSessionCookies(ctx, session)
	ctx.JSON(http.StatusOK, gin.H{"user": session.User})
}

func (server *Server) logout(ctx *gin.Context) {
	raw, _ := ctx.Cookie(refreshCookie)
	if err := server.accounts.Logout(ctx, raw); err != nil {
		respondError(ctx, err)
		return
	}
	server.clearSessionCookies(ctx)
	ctx.Status(http.StatusNoContent)
}

func (server *Server) me(ctx *gin.Context) {
	user, err := server.accounts.Me(ctx, authPayload(ctx).UserID)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"user": user})
}

// The access cookie goes to every API path; the refresh cookie only to /auth,
// so it is sent as rarely as possible. Both are httpOnly.
func (server *Server) setSessionCookies(ctx *gin.Context, s account.Session) {
	ctx.SetSameSite(http.SameSiteLaxMode)
	ctx.SetCookie(accessCookie, s.AccessToken, int(time.Until(s.AccessExpiresAt).Seconds()), "/", "", server.config.CookieSecure, true)
	ctx.SetCookie(refreshCookie, s.RefreshToken, int(time.Until(s.RefreshExpiresAt).Seconds()), "/api/v1/auth", "", server.config.CookieSecure, true)
}

func (server *Server) clearSessionCookies(ctx *gin.Context) {
	ctx.SetSameSite(http.SameSiteLaxMode)
	ctx.SetCookie(accessCookie, "", -1, "/", "", server.config.CookieSecure, true)
	ctx.SetCookie(refreshCookie, "", -1, "/api/v1/auth", "", server.config.CookieSecure, true)
}
