// Package admin holds the admin-only settings: utilities and their service
// areas, staff accounts, sensitive sites and priority weights.
package admin

import (
	"context"
	"encoding/json"
	"net/mail"
	"slices"
	"strings"

	"github.com/google/uuid"

	"flow/account"
	"flow/apperr"
	db "flow/db/sqlc"
	"flow/report"
	"flow/utils"
)

// Rescorer queues a full rescore after the weights change.
type Rescorer interface {
	DistributeTaskRescoreAll(ctx context.Context) error
}

type Service struct {
	store    db.Store
	rescorer Rescorer
}

func NewService(store db.Store, rescorer Rescorer) *Service {
	return &Service{store: store, rescorer: rescorer}
}

// --- utilities ---

type UtilityInput struct {
	Name        *string         `json:"name"`
	ServiceArea json.RawMessage `json:"service_area"` // GeoJSON Polygon or MultiPolygon
}

func validArea(raw json.RawMessage) bool {
	var g struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	}
	if json.Unmarshal(raw, &g) != nil || len(g.Coordinates) == 0 {
		return false
	}
	return g.Type == "Polygon" || g.Type == "MultiPolygon"
}

func (s *Service) ListUtilities(ctx context.Context) ([]db.ListUtilitiesRow, error) {
	return s.store.ListUtilities(ctx)
}

func (s *Service) CreateUtility(ctx context.Context, in UtilityInput) (db.GetUtilityRow, error) {
	errs := map[string]string{}
	if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
		errs["name"] = "Give the utility a name."
	}
	if !validArea(in.ServiceArea) {
		errs["service_area"] = "Draw the service area on the map (at least three points)."
	}
	if len(errs) > 0 {
		return db.GetUtilityRow{}, apperr.Validation(errs)
	}
	id, err := s.store.CreateUtility(ctx, db.CreateUtilityParams{Name: strings.TrimSpace(*in.Name), AreaGeojson: string(in.ServiceArea)})
	if err != nil {
		return db.GetUtilityRow{}, invalidGeometry(err)
	}
	if err := s.store.SavePrioritySettings(ctx, db.SavePrioritySettingsParams{UtilityID: id, Weights: mustJSON(report.DefaultSettings())}); err != nil {
		return db.GetUtilityRow{}, err
	}
	return s.store.GetUtility(ctx, id)
}

func (s *Service) UpdateUtility(ctx context.Context, id uuid.UUID, in UtilityInput) (db.GetUtilityRow, error) {
	var area *string
	if in.ServiceArea != nil {
		if !validArea(in.ServiceArea) {
			return db.GetUtilityRow{}, apperr.Validation(map[string]string{"service_area": "Draw the service area on the map (at least three points)."})
		}
		a := string(in.ServiceArea)
		area = &a
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) == "" {
		return db.GetUtilityRow{}, apperr.Validation(map[string]string{"name": "Give the utility a name."})
	}
	n, err := s.store.UpdateUtility(ctx, db.UpdateUtilityParams{ID: id, Name: in.Name, AreaGeojson: area})
	if err != nil {
		return db.GetUtilityRow{}, invalidGeometry(err)
	}
	if n == 0 {
		return db.GetUtilityRow{}, apperr.NotFound("utility")
	}
	return s.store.GetUtility(ctx, id)
}

func (s *Service) DeleteUtility(ctx context.Context, id uuid.UUID) error {
	n, err := s.store.DeleteUtility(ctx, id)
	if err != nil {
		if db.ErrorCode(err) == db.ForeignKeyViolation {
			return apperr.Conflict("utility_in_use", "This utility still has reports. Reassign or close them before deleting it.")
		}
		return err
	}
	if n == 0 {
		return apperr.NotFound("utility")
	}
	return nil
}

func invalidGeometry(err error) error {
	if code := db.ErrorCode(err); code == "XX000" || code == "22023" {
		return apperr.Validation(map[string]string{"service_area": "That shape isn't valid. Make sure its edges don't cross, then try again."})
	}
	return err
}

// --- staff ---

var staffRoles = []string{"dispatcher", "technician", "admin"}

type StaffInput struct {
	Name      *string    `json:"name"`
	Email     *string    `json:"email"`
	Role      *string    `json:"role"`
	UtilityID *uuid.UUID `json:"utility_id"`
	Password  *string    `json:"password"`
	Active    *bool      `json:"active"`
}

func (in StaffInput) validate(creating bool) map[string]string {
	errs := map[string]string{}
	if creating || in.Name != nil {
		if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
			errs["name"] = "Enter the person's name."
		}
	}
	if creating {
		if in.Email == nil {
			errs["email"] = "Enter a work email address."
		} else if _, err := mail.ParseAddress(*in.Email); err != nil {
			errs["email"] = "That email address doesn't look right."
		}
	}
	if creating || in.Role != nil {
		if in.Role == nil || !slices.Contains(staffRoles, *in.Role) {
			errs["role"] = "Pick dispatcher, technician or admin."
		} else if *in.Role != "admin" && in.UtilityID == nil && creating {
			errs["utility_id"] = "Pick which utility this person works for."
		}
	}
	if creating || in.Password != nil {
		if in.Password == nil || len(*in.Password) < 10 {
			errs["password"] = "Use at least 10 characters."
		}
	}
	return errs
}

type StaffDTO struct {
	account.UserDTO
	Active bool `json:"active"`
}

func (s *Service) ListStaffWithStatus(ctx context.Context) ([]StaffDTO, error) {
	users, err := s.store.ListStaff(ctx, db.ListStaffParams{})
	if err != nil {
		return nil, err
	}
	out := make([]StaffDTO, 0, len(users))
	for _, u := range users {
		out = append(out, StaffDTO{UserDTO: account.ToUserDTO(u), Active: u.Active})
	}
	return out, nil
}

func (s *Service) CreateStaff(ctx context.Context, in StaffInput) (StaffDTO, error) {
	if errs := in.validate(true); len(errs) > 0 {
		return StaffDTO{}, apperr.Validation(errs)
	}
	hash, err := utils.HashPassword(*in.Password)
	if err != nil {
		return StaffDTO{}, err
	}
	name, email := strings.TrimSpace(*in.Name), strings.TrimSpace(*in.Email)
	u, err := s.store.CreateUser(ctx, db.CreateUserParams{Role: *in.Role, Name: name, Email: &email, PasswordHash: &hash, UtilityID: in.UtilityID})
	if err != nil {
		switch db.ErrorCode(err) {
		case db.UniqueViolation:
			return StaffDTO{}, apperr.Validation(map[string]string{"email": "Someone already uses this email."})
		case db.ForeignKeyViolation:
			return StaffDTO{}, apperr.Validation(map[string]string{"utility_id": "Pick a utility from the list."})
		}
		return StaffDTO{}, err
	}
	return StaffDTO{UserDTO: account.ToUserDTO(u), Active: u.Active}, nil
}

func (s *Service) UpdateStaff(ctx context.Context, actorID, id uuid.UUID, in StaffInput) (StaffDTO, error) {
	if errs := in.validate(false); len(errs) > 0 {
		return StaffDTO{}, apperr.Validation(errs)
	}
	if id == actorID && in.Active != nil && !*in.Active {
		return StaffDTO{}, apperr.Validation(map[string]string{"active": "You can't turn off your own account."})
	}
	existing, err := s.store.GetUser(ctx, id)
	if err != nil || existing.Role == "citizen" {
		return StaffDTO{}, apperr.NotFound("staff member")
	}
	var hash *string
	if in.Password != nil {
		h, err := utils.HashPassword(*in.Password)
		if err != nil {
			return StaffDTO{}, err
		}
		hash = &h
	}
	var name *string
	if in.Name != nil {
		name = ptr(strings.TrimSpace(*in.Name))
	}
	u, err := s.store.UpdateUser(ctx, db.UpdateUserParams{ID: id, Name: name, Role: in.Role, UtilityID: in.UtilityID, Active: in.Active, PasswordHash: hash})
	if err != nil {
		return StaffDTO{}, err
	}
	return StaffDTO{UserDTO: account.ToUserDTO(u), Active: u.Active}, nil
}

// --- sensitive sites ---

type SiteInput struct {
	UtilityID *uuid.UUID `json:"utility_id"`
	Name      string     `json:"name"`
	Kind      string     `json:"kind"`
	Lat       float64    `json:"lat"`
	Lng       float64    `json:"lng"`
}

func (in *SiteInput) validate() map[string]string {
	errs := map[string]string{}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		errs["name"] = "Enter the site's name."
	}
	if !slices.Contains(report.SiteKinds, in.Kind) {
		errs["kind"] = "Pick a kind of site."
	}
	if in.Lat < -90 || in.Lat > 90 || in.Lng < -180 || in.Lng > 180 || (in.Lat == 0 && in.Lng == 0) {
		errs["location"] = "Click the map to place the site."
	}
	return errs
}

func (s *Service) ListSites(ctx context.Context) ([]db.ListSensitiveSitesRow, error) {
	return s.store.ListSensitiveSites(ctx, nil)
}

func (s *Service) CreateSite(ctx context.Context, in SiteInput) (uuid.UUID, error) {
	if errs := in.validate(); len(errs) > 0 {
		return uuid.Nil, apperr.Validation(errs)
	}
	id, err := s.store.CreateSensitiveSite(ctx, db.CreateSensitiveSiteParams{UtilityID: in.UtilityID, Name: in.Name, Kind: in.Kind, Lat: in.Lat, Lng: in.Lng})
	if err == nil {
		s.queueRescore(ctx)
	}
	return id, err
}

func (s *Service) UpdateSite(ctx context.Context, id uuid.UUID, in SiteInput) error {
	if errs := in.validate(); len(errs) > 0 {
		return apperr.Validation(errs)
	}
	n, err := s.store.UpdateSensitiveSite(ctx, db.UpdateSensitiveSiteParams{ID: id, Name: in.Name, Kind: in.Kind, Lat: in.Lat, Lng: in.Lng})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound("site")
	}
	s.queueRescore(ctx)
	return nil
}

func (s *Service) DeleteSite(ctx context.Context, id uuid.UUID) error {
	n, err := s.store.DeleteSensitiveSite(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound("site")
	}
	s.queueRescore(ctx)
	return nil
}

// --- priority settings ---

func (s *Service) GetSettings(ctx context.Context, utilityID uuid.UUID) (report.Settings, error) {
	raw, err := s.store.GetPrioritySettings(ctx, utilityID)
	if err != nil && !db.IsNotFound(err) {
		return report.Settings{}, err
	}
	return report.ParseSettings(raw), nil
}

func (s *Service) SaveSettings(ctx context.Context, actorID, utilityID uuid.UUID, in report.Settings) (report.Settings, error) {
	if errs := in.Validate(); errs != nil {
		return report.Settings{}, apperr.Validation(errs)
	}
	if _, err := s.store.GetUtility(ctx, utilityID); err != nil {
		if db.IsNotFound(err) {
			return report.Settings{}, apperr.NotFound("utility")
		}
		return report.Settings{}, err
	}
	if err := s.store.SavePrioritySettings(ctx, db.SavePrioritySettingsParams{UtilityID: utilityID, Weights: mustJSON(in), UpdatedBy: &actorID}); err != nil {
		return report.Settings{}, err
	}
	s.queueRescore(ctx)
	return in, nil
}

func (s *Service) queueRescore(ctx context.Context) {
	_ = s.rescorer.DistributeTaskRescoreAll(ctx) // the hourly rescore is the backstop
}

func (s *Service) ListZones(ctx context.Context, utilityID *uuid.UUID) ([]db.ListZonesRow, error) {
	return s.store.ListZones(ctx, utilityID)
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func ptr[T any](v T) *T { return &v }
