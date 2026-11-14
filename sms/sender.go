package sms

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"flow/config"
)

type SmsSender interface {
	SendSms(ctx context.Context, phoneNumber string, message string) error
}

// httpClient is shared by every provider in this package. The timeout matters:
// sends happen on worker goroutines, and Go's default client waits forever.
var httpClient = &http.Client{Timeout: 20 * time.Second}

// NewSmsSender picks the provider named by SMS_PROVIDER. Anything unknown
// falls back to the console logger so a typo never sends real texts.
func NewSmsSender(cfg config.Config) SmsSender {
	switch cfg.SmsProvider {
	case "africastalking":
		return &AfricasTalkingSender{
			apiURL:   cfg.ApiUrl,
			username: cfg.AfricasTalkingUsername,
			apiKey:   cfg.SenderApiKey,
			senderID: cfg.SenderID,
		}
	case "console", "":
		return ConsoleSender{}
	default:
		slog.Warn("unknown SMS_PROVIDER, using console", "provider", cfg.SmsProvider)
		return ConsoleSender{}
	}
}

// ConsoleSender logs messages instead of sending them. Used for local dev.
type ConsoleSender struct{}

func (ConsoleSender) SendSms(ctx context.Context, phoneNumber, message string) error {
	slog.InfoContext(ctx, "SMS (console)", "to", phoneNumber, "message", message)
	return nil
}
