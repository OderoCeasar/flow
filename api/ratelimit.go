package api

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"flow/apperr"
)

// rateLimiter is an in-memory token bucket per key (IP or phone number).
// Fine for one API instance; move it to Postgres or Redis before running several.
type rateLimiter struct {
	mu      sync.Mutex
	perHour float64
	burst   int
	buckets map[string]*bucket
}

type bucket struct {
	limiter *rate.Limiter
	seen    time.Time
}

func newRateLimiter(perHour float64, burst int) *rateLimiter {
	l := &rateLimiter{perHour: perHour, burst: burst, buckets: map[string]*bucket{}}
	go l.sweep()
	return l
}

// Allow reports whether one more request for key fits in the budget.
func (l *rateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{limiter: rate.NewLimiter(rate.Limit(l.perHour/3600), l.burst)}
		l.buckets[key] = b
	}
	b.seen = time.Now()
	return b.limiter.Allow()
}

func (l *rateLimiter) byIP() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if !l.Allow(ctx.ClientIP()) {
			ctx.Header("Retry-After", "600")
			respondError(ctx, apperr.RateLimited())
			return
		}
		ctx.Next()
	}
}

// sweep forgets idle keys so the map doesn't grow forever.
func (l *rateLimiter) sweep() {
	for range time.Tick(10 * time.Minute) {
		l.mu.Lock()
		for k, b := range l.buckets {
			if time.Since(b.seen) > 2*time.Hour {
				delete(l.buckets, k)
			}
		}
		l.mu.Unlock()
	}
}
