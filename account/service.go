// Package account handles signing in: phone + one-time code for citizens,
// email + password for utility staff, and refresh-token rotation.
package account

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"flow/apperr"
	"flow/config"
	db "flow/db/sqlc"
	"flow/sms"
	"flow/token"
	"flow/utils"
)

// dummyHash is compared against when the email is unknown, so a miss costs
// the same bcrypt time as a wrong password.
var dummyHash, _ = utils.HashPassword("flow-timing-equaliser")

const (
	otpTTL         = 5 * time.Minute
	otpMaxAttempts = 5
)

type Service struct {
	store      db.Store
	tokenMaker token.Maker
	smsSender  sms.SmsSender
	config     config.Config
}

func NewService(store db.Store, tokenMaker token.Maker, smsSender sms.SmsSender, cfg config.Config) *Service {
	return &Service{store: store, tokenMaker: tokenMaker, smsSender: smsSender, config: cfg}
}

type UserDTO struct {
	ID        uuid.UUID  `json:"id"`
	Role      string     `json:"role"`
	Name      string     `json:"name"`
	Phone     *string    `json:"phone,omitempty"`
	Email     *string    `json:"email,omitempty"`
	UtilityID *uuid.UUID `json:"utility_id,omitempty"`
}

func ToUserDTO(u db.User) UserDTO {
	return UserDTO{ID: u.ID, Role: u.Role, Name: u.Name, Phone: u.Phone, Email: u.Email, UtilityID: u.UtilityID}
}

// Session is a fresh access/refresh pair. The API puts both in httpOnly cookies.
type Session struct {
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
	User             UserDTO
}

type OTPRequestResult struct {
	Phone   string `json:"phone"`
	DevCode string `json:"dev_code,omitempty"` // only with DEV_OTP_ECHO in local
}

// RequestOTP texts a sign-in code. The phone has already been rate-limited.
func (s *Service) RequestOTP(ctx context.Context, rawPhone, locale string) (OTPRequestResult, error) {
	phone, err := utils.NormalizeKenyanPhone(rawPhone)
	if err != nil {
		return OTPRequestResult{}, apperr.Validation(map[string]string{"phone": "Enter a Kenyan mobile number, like 0712 345 678."})
	}
	code := utils.RandomOTP()
	if err := s.store.CreateOTP(ctx, db.CreateOTPParams{Phone: phone, CodeHash: otpHash(phone, code), ExpiresAt: time.Now().Add(otpTTL)}); err != nil {
		return OTPRequestResult{}, err
	}
	if err := s.smsSender.SendSms(ctx, phone, sms.OTPMessage(locale, code)); err != nil {
		return OTPRequestResult{}, apperr.New(http.StatusBadGateway, "sms_failed",
			"We couldn't send the code right now. Check the number and try again in a minute.")
	}
	res := OTPRequestResult{Phone: phone}
	if s.config.DevOTPEcho && s.config.IsLocalEnv() {
		res.DevCode = code
	}
	return res, nil
}

// VerifyOTP checks the code, creates the citizen account on first sign-in,
// and links any reports they made anonymously with the same number.
func (s *Service) VerifyOTP(ctx context.Context, rawPhone, code string) (Session, error) {
	phone, err := utils.NormalizeKenyanPhone(rawPhone)
	if err != nil {
		return Session{}, apperr.Validation(map[string]string{"phone": "Enter a Kenyan mobile number, like 0712 345 678."})
	}
	wrong := apperr.Validation(map[string]string{"code": "That code isn't right. Check the SMS and try again."})
	otp, err := s.store.GetLatestOTP(ctx, phone)
	if err != nil {
		if db.IsNotFound(err) {
			return Session{}, apperr.Validation(map[string]string{"code": "That code has expired. Ask for a new one."})
		}
		return Session{}, err
	}
	if otp.Attempts >= otpMaxAttempts {
		return Session{}, apperr.New(http.StatusTooManyRequests, "too_many_attempts", "Too many wrong codes. Ask for a new code.")
	}
	if subtle.ConstantTimeCompare([]byte(otp.CodeHash), []byte(otpHash(phone, strings.TrimSpace(code)))) != 1 {
		if err := s.store.BumpOTPAttempts(ctx, otp.ID); err != nil {
			return Session{}, err
		}
		return Session{}, wrong
	}

	var user db.User
	err = s.store.ExecTx(ctx, func(q db.Querier) error {
		if err := q.ConsumeOTP(ctx, otp.ID); err != nil {
			return err
		}
		user, err = q.GetUserByPhone(ctx, &phone)
		if db.IsNotFound(err) {
			user, err = q.CreateUser(ctx, db.CreateUserParams{Role: "citizen", Phone: &phone})
		}
		if err != nil {
			return err
		}
		return q.LinkReportsToUser(ctx, db.LinkReportsToUserParams{UserID: &user.ID, Phone: &phone})
	})
	if err != nil {
		return Session{}, err
	}
	if !user.Active {
		return Session{}, apperr.New(http.StatusForbidden, "account_disabled", "This account has been turned off. Contact the water utility for help.")
	}
	if user.Role != "citizen" {
		return Session{}, apperr.New(http.StatusForbidden, "use_staff_login", "Staff accounts sign in with email and password.")
	}
	return s.issue(ctx, user)
}

// Login is for utility staff.
func (s *Service) Login(ctx context.Context, email, password string) (Session, error) {
	bad := apperr.New(http.StatusUnauthorized, "bad_credentials", "That email and password don't match. Check them and try again.")
	user, err := s.store.GetUserByEmail(ctx, strings.TrimSpace(email))
	if err != nil {
		if db.IsNotFound(err) {
			// Spend the same time as a real check so unknown emails aren't detectable.
			_ = utils.CheckPassword(password, dummyHash)
			return Session{}, bad
		}
		return Session{}, err
	}
	if user.PasswordHash == nil || user.Role == "citizen" || utils.CheckPassword(password, *user.PasswordHash) != nil {
		return Session{}, bad
	}
	if !user.Active {
		return Session{}, apperr.New(http.StatusForbidden, "account_disabled", "This account has been turned off. Ask an admin to turn it back on.")
	}
	return s.issue(ctx, user)
}

// Refresh swaps a refresh token for a new pair. Each refresh token works once.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (Session, error) {
	if refreshToken == "" {
		return Session{}, apperr.Unauthorized()
	}
	userID, err := s.store.UseRefreshToken(ctx, utils.HashToken(refreshToken))
	if err != nil {
		if db.IsNotFound(err) {
			return Session{}, apperr.New(http.StatusUnauthorized, "session_expired", "Your session has ended. Please sign in again.")
		}
		return Session{}, err
	}
	user, err := s.store.GetUser(ctx, userID)
	if err != nil || !user.Active {
		return Session{}, apperr.New(http.StatusUnauthorized, "session_expired", "Your session has ended. Please sign in again.")
	}
	return s.issue(ctx, user)
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	return s.store.RevokeRefreshToken(ctx, utils.HashToken(refreshToken))
}

func (s *Service) Me(ctx context.Context, userID uuid.UUID) (UserDTO, error) {
	u, err := s.store.GetUser(ctx, userID)
	if err != nil {
		if db.IsNotFound(err) {
			return UserDTO{}, apperr.Unauthorized()
		}
		return UserDTO{}, err
	}
	return ToUserDTO(u), nil
}

func (s *Service) issue(ctx context.Context, u db.User) (Session, error) {
	access, payload, err := s.tokenMaker.CreateToken(u.ID, u.Role, u.UtilityID, s.config.AccessTokenDuration)
	if err != nil {
		return Session{}, err
	}
	refresh := utils.RandomToken(32)
	refreshExp := time.Now().Add(s.config.RefreshTokenDuration)
	if err := s.store.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{UserID: u.ID, TokenHash: utils.HashToken(refresh), ExpiresAt: refreshExp}); err != nil {
		return Session{}, err
	}
	return Session{AccessToken: access, AccessExpiresAt: payload.ExpiredAt, RefreshToken: refresh, RefreshExpiresAt: refreshExp, User: ToUserDTO(u)}, nil
}

// otpHash ties the code to the phone so a leaked table row can't be replayed
// for another number. Codes live five minutes and allow five tries.
func otpHash(phone, code string) string {
	return utils.HashToken(phone + ":" + code)
}
