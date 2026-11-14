package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"flow/apperr"
	"flow/imaging"
)

func (server *Server) listJobs(ctx *gin.Context) {
	jobs, err := server.reports.Jobs(ctx, actorFrom(ctx), ctx.Query("include_done") == "true")
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": jobs})
}

type jobStatusRequest struct {
	Status string `json:"status" binding:"required"`
	Note   string `json:"note"`
}

func (server *Server) updateJobStatus(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	var req jobStatusRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		respondError(ctx, badRequest("Pick the job's new status."))
		return
	}
	job, err := server.reports.UpdateJobStatus(ctx, actorFrom(ctx), id, req.Status, req.Note)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusOK, job)
}

func (server *Server) uploadJobPhoto(ctx *gin.Context) {
	id, ok := parseID(ctx, "id")
	if !ok {
		return
	}
	ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, imaging.MaxUploadBytes+(1<<20))
	file, _, err := ctx.Request.FormFile("photo")
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			respondError(ctx, apperr.Validation(map[string]string{"photo": "That photo is too large (over 10 MB). Try again with a smaller one."}))
			return
		}
		respondError(ctx, apperr.Validation(map[string]string{"photo": "Choose a photo to upload."}))
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, imaging.MaxUploadBytes+1))
	if err != nil {
		respondError(ctx, badRequest("We couldn't read the photo. Please try again."))
		return
	}
	job, err := server.reports.AddAfterPhoto(ctx, actorFrom(ctx), id, data)
	if err != nil {
		respondError(ctx, err)
		return
	}
	ctx.JSON(http.StatusCreated, job)
}
