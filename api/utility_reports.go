package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"flow/report"
)

func splitList(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := parts[:0]
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func parseID(ctx *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(ctx.Param(name))
	if err != nil {
		respondError(ctx, badRequest("That ID isn't valid."))
		return uuid.Nil, false
	}
	return id, true
}

// listUtilityReports supports: status, severity, leak_type, zone (comma lists),
// from/to (YYYY-MM-DD), q, needs_review, bbox (minLng,minLat,maxLng,maxLat),
// sort (priority|newest|oldest|severity), page, page_size.
func (server *Server) listUtilityReports(ctx *gin.Context) {
	f := report.ListFilter{
		Statuses:    splitList(ctx.Query("status")),
		Severities:  splitList(ctx.Query("severity")),
		LeakTypes:   splitList(ctx.Query("leak_type")),
		Query:       strings.TrimSpace(ctx.Query("q")),
		NeedsReview: ctx.Query("needs_review") == "true",
		Sort:        ctx.Query("sort"),
	}
	f.Page, _ = strconv.Atoi(ctx.Query("page"))
	f.PageSize, _ = strconv.Atoi(ctx.Query("page_size"))
	for _, z := range splitList(ctx.Query("zone")) {
		id, err := uuid.Parse(z)
		if err != nil {
			respondError(ctx, badRequest("One of the areas isn't valid."))
			return
		}
		f.ZoneIDs = append(f.ZoneIDs, id)
	}
	if v := ctx.Query("from"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			respondError(ctx, badRequest("Use dates like 2026-11-14."))
			return
		}
		f.From = &t
	}
	if v := ctx.Query("to"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			respondError(ctx, badRequest("Use dates like 2026-11-14."))
			return
		}
		t = t.AddDate(0, 0, 1) // include the whole "to" day
		f.To = &t
	}
	if parts := splitList(ctx.Query("bbox")); len(parts) == 4 {
		var b [4]float64
		for i, p := range parts {
			v, err := strconv.ParseFloat(p, 64)
			if err != nil {
				respondError(ctx, badRequest("The map area isn't valid."))
				return
			}
			b[i] = v
		}
		f.BBox = &b
	}
	page, err := server.reports.ListReports(ctx, actorFrom(ctx), f)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, page)
}

func (server *Server) getUtilityReport(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	d, err := server.reports.Detail(ctx, actorFrom(ctx), id)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, d)
}

func (server *Server) updateUtilityReport(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var in report.UpdateInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("We couldn't read that change. Please try again."))
		return
	}
	d, err := server.reports.Update(ctx, actorFrom(ctx), id, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, d)
}

func (server *Server) assignReport(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var in report.AssignInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("Pick a technician to assign."))
		return
	}
	d, err := server.reports.Assign(ctx, actorFrom(ctx), id, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, d)
}

func (server *Server) mergeClusters(ctx *gin.Context) {
	var in report.MergeInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("Pick the reports to merge."))
		return
	}
	res, err := server.reports.Merge(ctx, actorFrom(ctx), in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, res)
}

func (server *Server) splitCluster(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var in report.SplitInput
	if err := ctx.ShouldBindJSON(&in); err != nil {
		respondError(ctx, badRequest("Pick the reports to split out."))
		return
	}
	d, err := server.reports.Split(ctx, actorFrom(ctx), id, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, d)
}

func (server *Server) listTechnicians(ctx *gin.Context) {
	var forReport *uuid.UUID
	if v := ctx.Query("report_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			respondError(ctx, badRequest("That report ID isn't valid."))
			return
		}
		forReport = &id
	}
	techs, err := server.reports.Technicians(ctx, actorFrom(ctx), forReport)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": techs})
}

func (server *Server) utilityStats(ctx *gin.Context) {
	stats, err := server.reports.Stats(ctx, actorFrom(ctx))
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, stats)
}

func (server *Server) listZones(ctx *gin.Context) {
	zones, err := server.admin.ListZones(ctx, actorFrom(ctx).UtilityID)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": zones})
}

func (server *Server) listCrews(ctx *gin.Context) {
	crews, err := server.reports.Crews(ctx, actorFrom(ctx))
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": crews})
}
