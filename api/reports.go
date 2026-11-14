package api

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"flow/apperr"
	"flow/imaging"
	"flow/report"
)

// createReport takes multipart form data: an optional "photo" file plus the
// report fields. Size and type are checked here and again by content in the service.
func (server *Server) createReport(ctx *gin.Context) {
	ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, imaging.MaxUploadBytes+(1<<20))
	if err := ctx.Request.ParseMultipartForm(2 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			respondError(ctx, apperr.Validation(map[string]string{"photo": "That photo is too large (over 10 MB). Try again with a smaller one."}))
			return
		}
		respondError(ctx, badRequest("We couldn't read the form. Please try again."))
		return
	}

	in := report.CreateReportInput{
		AddressText: ctx.PostForm("address_text"),
		Description: ctx.PostForm("description"),
		LeakType:    ctx.PostForm("leak_type"),
		Size:        ctx.PostForm("size"),
		Duration:    ctx.PostForm("duration"),
		Phone:       strings.TrimSpace(ctx.PostForm("phone")),
		Locale:      ctx.PostForm("locale"),
	}
	if lat, err := strconv.ParseFloat(ctx.PostForm("lat"), 64); err == nil {
		in.Lat = &lat
	}
	if lng, err := strconv.ParseFloat(ctx.PostForm("lng"), 64); err == nil {
		in.Lng = &lng
	}
	if id, err := uuid.Parse(ctx.PostForm("join_cluster_id")); err == nil {
		in.JoinClusterID = &id
	}
	if p := authPayload(ctx); p != nil && p.Role == "citizen" {
		in.ReporterID = &p.UserID
	}
	if file, _, err := ctx.Request.FormFile("photo"); err == nil {
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, imaging.MaxUploadBytes+1))
		if err != nil {
			respondError(ctx, badRequest("We couldn't read the photo. Please try again."))
			return
		}
		in.Photo = data
	}

	res, err := server.reports.CreateReport(ctx, in)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusCreated, res)
}

func (server *Server) getPublicReport(ctx *gin.Context) {
	res, err := server.reports.PublicStatus(ctx, ctx.Param("ref"))
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, res)
}

func (server *Server) nearbyReports(ctx *gin.Context) {
	lat, err1 := strconv.ParseFloat(ctx.Query("lat"), 64)
	lng, err2 := strconv.ParseFloat(ctx.Query("lng"), 64)
	if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		respondError(ctx, badRequest("Send lat and lng as numbers."))
		return
	}
	res, err := server.reports.Nearby(ctx, lat, lng, ctx.Query("leak_type"))
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, res)
}

func (server *Server) myReports(ctx *gin.Context) {
	p := authPayload(ctx)
	user, err := server.accounts.Me(ctx, p.UserID)
	if err != nil {
		respondError(ctx, err)
		return
	}
	phone := ""
	if user.Phone != nil {
		phone = *user.Phone
	}
	res, err := server.reports.MyReports(ctx, p.UserID, phone)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": res})
}
