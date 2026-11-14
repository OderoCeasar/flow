package api

import (
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"flow/apperr"
)

func (server *Server) setupRouter() {
	if !server.config.IsLocalEnv() {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(requestLogger())
	router.Use(gin.CustomRecovery(func(ctx *gin.Context, recovered any) {
		slog.ErrorContext(ctx, "panic recovered", "panic", recovered, "path", ctx.FullPath())
		respondError(ctx, apperr.New(http.StatusInternalServerError, "internal", internalErrorMessage))
	}))
	// Only nginx sits in front of the API, on the same Docker network.
	_ = router.SetTrustedProxies([]string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"})
	router.Use(securityHeaders())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     server.config.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "Accept-Language"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	// Auth cookies are SameSite=Lax; this blocks the remaining cross-site
	// form posts by checking Origin on anything that changes state.
	router.Use(server.originGuard())

	router.GET("/healthz", server.health)

	v1 := router.Group("/api/v1")
	v1.Use(server.optionalAuth())

	// Citizens (most work without an account).
	v1.POST("/reports", server.reportLimiter.byIP(), server.createReport)
	v1.GET("/reports/nearby", server.nearbyReports)
	v1.GET("/reports/:ref", server.lookupLimiter.byIP(), server.getPublicReport)
	v1.POST("/reports/:ref/feedback", server.feedbackLimiter.byIP(), server.reportFeedback)
	v1.GET("/geocode/reverse", server.geocodeLimiter.byIP(), server.reverseGeocode)

	auth := v1.Group("/auth")
	auth.POST("/otp/request", server.otpIPLimiter.byIP(), server.requestOTP)
	auth.POST("/otp/verify", server.otpIPLimiter.byIP(), server.verifyOTP)
	auth.POST("/login", server.loginLimiter.byIP(), server.login)
	auth.POST("/refresh", server.refresh)
	auth.POST("/logout", server.logout)
	auth.GET("/me", server.requireRoles(), server.me)

	v1.GET("/me/reports", server.requireRoles("citizen"), server.myReports)

	// Dispatchers (admins can do everything a dispatcher can).
	utility := v1.Group("/utility", server.requireRoles("dispatcher", "admin"))
	utility.GET("/reports", server.listUtilityReports)
	utility.GET("/reports/:id", server.getUtilityReport)
	utility.PATCH("/reports/:id", server.updateUtilityReport)
	utility.POST("/reports/:id/assign", server.assignReport)
	utility.POST("/clusters/merge", server.mergeClusters)
	utility.POST("/clusters/:id/split", server.splitCluster)
	utility.GET("/technicians", server.listTechnicians)
	utility.GET("/stats", server.utilityStats)
	utility.GET("/zones", server.listZones)

	// Field technicians.
	tech := v1.Group("/tech", server.requireRoles("technician"))
	tech.GET("/jobs", server.listJobs)
	tech.PATCH("/jobs/:id/status", server.updateJobStatus)
	tech.POST("/jobs/:id/photos", server.uploadJobPhoto)

	// Admins.
	adm := v1.Group("/admin", server.requireRoles("admin"))
	adm.GET("/utilities", server.listUtilities)
	adm.POST("/utilities", server.createUtility)
	adm.PATCH("/utilities/:id", server.updateUtility)
	adm.DELETE("/utilities/:id", server.deleteUtility)
	adm.GET("/staff", server.listStaff)
	adm.POST("/staff", server.createStaff)
	adm.PATCH("/staff/:id", server.updateStaff)
	adm.GET("/sensitive-sites", server.listSites)
	adm.POST("/sensitive-sites", server.createSite)
	adm.PUT("/sensitive-sites/:id", server.updateSite)
	adm.DELETE("/sensitive-sites/:id", server.deleteSite)
	adm.GET("/priority-settings/:utility_id", server.getPrioritySettings)
	adm.PUT("/priority-settings/:utility_id", server.savePrioritySettings)

	router.NoRoute(func(ctx *gin.Context) {
		respondError(ctx, apperr.New(http.StatusNotFound, "not_found", "That page or action doesn't exist."))
	})

	server.router = router
}

func (server *Server) health(ctx *gin.Context) {
	if err := server.store.Ping(ctx); err != nil {
		ctx.JSON(http.StatusServiceUnavailable, gin.H{"status": "db_unavailable"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func requestLogger() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		start := time.Now()
		id := ctx.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		ctx.Header("X-Request-ID", id)
		ctx.Next()
		if ctx.FullPath() == "/healthz" {
			return
		}
		slog.Info("http request", "request_id", id, "method", ctx.Request.Method, "path", ctx.FullPath(),
			"status", ctx.Writer.Status(), "took", time.Since(start).Round(time.Millisecond).String(), "ip", ctx.ClientIP())
	}
}

func securityHeaders() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		h := ctx.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Cache-Control", "no-store")
		ctx.Next()
	}
}

func (server *Server) originGuard() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		switch ctx.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			ctx.Next()
			return
		}
		origin := ctx.GetHeader("Origin")
		if origin != "" && !slices.Contains(server.config.AllowedOrigins, origin) {
			respondError(ctx, apperr.New(http.StatusForbidden, "bad_origin", "This request came from a site we don't recognise."))
			return
		}
		ctx.Next()
	}
}
