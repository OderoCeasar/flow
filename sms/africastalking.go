package sms

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// AfricasTalkingSender sends through Africa's Talking's bulk messaging API.
type AfricasTalkingSender struct {
	apiURL   string
	username string
	apiKey   string
	senderID string
}

// Africa's Talking answers 201 for any request it accepts, whether or not the
// message went out, so the per-recipient status code is the real outcome.
const (
	statusProcessed = 100
	statusSent      = 101
	statusQueued    = 102
)

type atResponse struct {
	SMSMessageData struct {
		Message    string `json:"Message"`
		Recipients []struct {
			StatusCode int    `json:"statusCode"`
			Status     string `json:"status"`
			Number     string `json:"number"`
		} `json:"Recipients"`
	} `json:"SMSMessageData"`
}

func (s *AfricasTalkingSender) SendSms(ctx context.Context, phoneNumber, message string) error {
	form := url.Values{"username": {s.username}, "to": {phoneNumber}, "message": {message}}
	if s.senderID != "" {
		form.Set("from", s.senderID)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.apiURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("apiKey", s.apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("africastalking request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("africastalking status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var parsed atResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return fmt.Errorf("africastalking response: %w", err)
	}
	for _, r := range parsed.SMSMessageData.Recipients {
		switch r.StatusCode {
		case statusProcessed, statusSent, statusQueued:
			return nil
		default:
			return fmt.Errorf("africastalking rejected message: %d %s", r.StatusCode, r.Status)
		}
	}
	return fmt.Errorf("africastalking accepted no recipients: %s", parsed.SMSMessageData.Message)
}
