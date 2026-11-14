package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"flow/admin"
	"flow/report"
)

func (server *Server) listUtilities(ctx *gin.Context) {
	items, err := server.admin.ListUtilities(ctx)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (server *Server) createUtility(ctx *gin.Context) {
	var in admin.UtilityInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that utility. Please try again."))
		return
	}
	u, err := server.admin.CreateUtility(ctx, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusCreated, u)
}

func (server *Server) updateUtility(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var in admin.UtilityInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that change. Please try again."))
		return
	}
	u, err := server.admin.UpdateUtility(ctx, id, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, u)
}

func (server *Server) deleteUtility(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	if err := server.admin.DeleteUtility(ctx, id); err != nil {
		respondError(ctx, err)
		return
	}
	ctx.Status(http.StatusNoContent)
}

func (server *Server) listStaff(ctx *gin.Context) {
	items, err := server.admin.ListStaffWithStatus(ctx)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (server *Server) createStaff(ctx *gin.Context) {
	var in admin.StaffInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that staff member. Please try again."))
		return
	}
	u, err := server.admin.CreateStaff(ctx, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusCreated, u)
}

func (server *Server) updateStaff(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var in admin.StaffInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that change. Please try again."))
		return
	}
	u, err := server.admin.UpdateStaff(ctx, authPayload(ctx).UserID, id, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, u)
}

func (server *Server) listSites(ctx *gin.Context) {
	items, err := server.admin.ListSites(ctx)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (server *Server) createSite(ctx *gin.Context) {
	var in admin.SiteInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that site. Please try again."))
		return
	}
	id, err := server.admin.CreateSite(ctx, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"id": id})
}

func (server *Server) updateSite(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var in admin.SiteInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that site. Please try again."))
		return
	}
	if err := server.admin.UpdateSite(ctx, id, in); err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"id": id})
}

func (server *Server) deleteSite(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	if err := server.admin.DeleteSite(ctx, id); err != nil {
		respondError(ctx, err)
		return
	}
	ctx.Status(http.StatusNoContent)
}

func (server *Server) getPrioritySettings(ctx *gin.Context) {
	id, ok := parseID(ctx, "utility_id")
	if !ok {
		return
	}
	s, err := server.admin.GetSettings(ctx, id)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"settings": s, "defaults": report.DefaultSettings()})
}

func (server *Server) savePrioritySettings(ctx *gin.Context) {
	id, ok := parseID(ctx, "utility_id")
	if !ok {
		return
	}
	var in report.Settings
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read those settings. Please try again."))
		return
	}
	s, err := server.admin.SaveSettings(ctx, authPayload(ctx).UserID, id, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"settings": s, "defaults": report.DefaultSettings()})
}
