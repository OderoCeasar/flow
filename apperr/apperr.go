// Package apperr defines the errors services return. The HTTP layer turns them
// into the shared JSON error shape. Messages are written for a person reading
// quickly on a phone: what went wrong and what to do next.
package apperr

import (
	"errors"
	"fmt"
	"net/http"
)

type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func Validation(fields map[string]string) *Error {
	return &Error{
		Status:  http.StatusUnprocessableEntity,
		Code:    "validation_failed",
		Message: "Some details need fixing. Check the highlighted fields and try again.",
		Fields:  fields,
	}
}

func NotFound(what string) *Error {
	return New(http.StatusNotFound, "not_found", fmt.Sprintf("We couldn't find that %s. Check the details and try again.", what))
}

func Forbidden() *Error {
	return New(http.StatusForbidden, "forbidden", "You don't have permission to do this. Ask an admin if you think you should.")
}

func Unauthorized() *Error {
	return New(http.StatusUnauthorized, "unauthorized", "Please sign in to continue.")
}

func Conflict(code, message string) *Error {
	return New(http.StatusConflict, code, message)
}

func RateLimited() *Error {
	return New(http.StatusTooManyRequests, "rate_limited", "Too many attempts. Please wait a few minutes and try again.")
}

// As extracts an *Error from err, if there is one.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
