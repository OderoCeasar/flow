package report

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"flow/apperr"
	db "flow/db/sqlc"
	"flow/imaging"
)

type JobDTO struct {
	ReportDTO
	Photos []PhotoDTO `json:"photos"`
}

// Jobs lists the technician's active work (and recent finished jobs when asked).
func (s *Service) Jobs(ctx context.Context, actor Actor, includeDone bool) ([]JobDTO, error) {
	if actor.Role != "technician" {
		return nil, apperr.Forbidden()
	}
	rows, err := s.store.ListJobsForTechnician(ctx, db.ListJobsForTechnicianParams{TechnicianID: actor.UserID, IncludeDone: includeDone})
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	photos, err := s.store.ListPhotosForReports(ctx, ids)
	if err != nil {
		return nil, err
	}
	signed := s.signPhotos(ctx, photos)
	out := make([]JobDTO, len(rows))
	for i, r := range rows {
		out[i] = JobDTO{ReportDTO: toDTO(r), Photos: []PhotoDTO{}}
		for _, p := range signed {
			if p.ReportID == r.ID {
				out[i].Photos = append(out[i].Photos, p)
			}
		}
	}
	return out, nil
}

// assignedJob loads a report and checks it is assigned to this technician.
func (s *Service) assignedJob(ctx context.Context, actor Actor, id uuid.UUID) (db.ReportView, error) {
	if actor.Role != "technician" {
		return db.ReportView{}, apperr.Forbidden()
	}
	r, err := s.store.GetReport(ctx, id)
	if err != nil {
		if db.IsNotFound(err) {
			return r, apperr.NotFound("job")
		}
		return r, err
	}
	if r.AssigneeID == nil || *r.AssigneeID != actor.UserID {
		return r, apperr.NotFound("job")
	}
	return r, nil
}

func (s *Service) UpdateJobStatus(ctx context.Context, actor Actor, id uuid.UUID, status, note string) (JobDTO, error) {
	r, err := s.assignedJob(ctx, actor, id)
	if err != nil {
		return JobDTO{}, err
	}
	note = strings.TrimSpace(note)
	if len(note) > 500 {
		return JobDTO{}, apperr.Validation(map[string]string{"note": "Keep the note under 500 characters."})
	}
	if !TechnicianCanMove(r.Status, status) {
		return JobDTO{}, apperr.Conflict("invalid_status_change",
			fmt.Sprintf("This job is %s, so it can't be moved to that step. Refresh to see the latest.", strings.ReplaceAll(r.Status, "_", " ")))
	}
	var changed []uuid.UUID
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		changed, err = s.setGroupStatus(ctx, q, r, status, &actor.UserID, note)
		return err
	})
	if err != nil {
		return JobDTO{}, err
	}
	s.afterStatusChange(ctx, changed, &status)
	if err := s.Rescore(ctx, r.ID); err != nil {
		return JobDTO{}, err
	}
	return s.job(ctx, r.ID)
}

// AddAfterPhoto stores the technician's proof-of-repair photo.
func (s *Service) AddAfterPhoto(ctx context.Context, actor Actor, id uuid.UUID, raw []byte) (JobDTO, error) {
	r, err := s.assignedJob(ctx, actor, id)
	if err != nil {
		return JobDTO{}, err
	}
	if len(raw) == 0 {
		return JobDTO{}, apperr.Validation(map[string]string{"photo": "Choose a photo to upload."})
	}
	res, err := imaging.Process(raw)
	switch {
	case errors.Is(err, imaging.ErrTooLarge):
		return JobDTO{}, apperr.Validation(map[string]string{"photo": "That photo is too large (over 10 MB). Try again with a smaller one."})
	case errors.Is(err, imaging.ErrUnsupported), errors.Is(err, imaging.ErrCorrupt):
		return JobDTO{}, apperr.Validation(map[string]string{"photo": "We couldn't read that file. Use a JPG, PNG or WebP photo."})
	case err != nil:
		return JobDTO{}, err
	}
	key := fmt.Sprintf("reports/%s/after-%s.jpg", s.now().UTC().Format("2006/01/02"), uuid.NewString())
	if err := s.photos.Put(ctx, key, res.Data, "image/jpeg"); err != nil {
		return JobDTO{}, fmt.Errorf("store photo: %w", err)
	}
	if _, err := s.store.CreatePhoto(ctx, db.CreatePhotoParams{ReportID: r.ID, StorageKey: key, Kind: "after",
		ContentType: "image/jpeg", SizeBytes: int32(len(res.Data)), UploadedBy: &actor.UserID}); err != nil {
		return JobDTO{}, err
	}
	return s.job(ctx, r.ID)
}

func (s *Service) job(ctx context.Context, id uuid.UUID) (JobDTO, error) {
	r, err := s.store.GetReport(ctx, id)
	if err != nil {
		return JobDTO{}, err
	}
	photos, err := s.store.ListPhotosForReports(ctx, []uuid.UUID{id})
	if err != nil {
		return JobDTO{}, err
	}
	return JobDTO{ReportDTO: toDTO(r), Photos: s.signPhotos(ctx, photos)}, nil
}
