// Package geocode turns a pin on the map into a street address people
// recognise ("Ngong Road, near Prestige Plaza · Kilimani, Nairobi").
package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type Address struct {
	Road  string `json:"road,omitempty"`  // street name
	Place string `json:"place,omitempty"` // a named building or landmark at the spot
	Area  string `json:"area,omitempty"`  // neighbourhood, e.g. Kilimani
	City  string `json:"city,omitempty"`
}

type Reverser interface {
	Reverse(ctx context.Context, lat, lng float64) (Address, error)
}

// Off returns no address; the app then just shows the pin.
type Off struct{}

func (Off) Reverse(context.Context, float64, float64) (Address, error) { return Address{}, nil }

// Nominatim uses OpenStreetMap's geocoder. The public server allows at most
// one request a second and needs an identifying User-Agent, so requests are
// throttled and answers cached. Point baseURL at your own instance for real traffic.
type Nominatim struct {
	baseURL   string
	userAgent string
	email     string
	client    *http.Client
	limiter   *rate.Limiter

	mu    sync.Mutex
	cache map[string]Address
	order []string
}

const cacheSize = 2000

func NewNominatim(baseURL, userAgent, email string) *Nominatim {
	return &Nominatim{
		baseURL:   strings.TrimRight(baseURL, "/"),
		userAgent: userAgent,
		email:     email,
		client:    &http.Client{Timeout: 5 * time.Second},
		limiter:   rate.NewLimiter(rate.Every(time.Second), 1),
		cache:     map[string]Address{},
	}
}

type nominatimResponse struct {
	Name    string            `json:"name"`
	Address map[string]string `json:"address"`
	Error   string            `json:"error"`
}

func (n *Nominatim) Reverse(ctx context.Context, lat, lng float64) (Address, error) {
	// About 11 m of rounding: close enough for a street name, and repeat pins hit the cache.
	key := fmt.Sprintf("%.4f,%.4f", lat, lng)
	n.mu.Lock()
	if a, ok := n.cache[key]; ok {
		n.mu.Unlock()
		return a, nil
	}
	n.mu.Unlock()

	waitCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	if err := n.limiter.Wait(waitCtx); err != nil {
		return Address{}, fmt.Errorf("geocoder busy: %w", err)
	}
	q := url.Values{
		"format": {"jsonv2"}, "lat": {fmt.Sprintf("%.6f", lat)}, "lon": {fmt.Sprintf("%.6f", lng)},
		"zoom": {"18"}, "addressdetails": {"1"}, "accept-language": {"en"},
	}
	if n.email != "" {
		q.Set("email", n.email)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, n.baseURL+"/reverse?"+q.Encode(), nil)
	if err != nil {
		return Address{}, err
	}
	req.Header.Set("User-Agent", n.userAgent)
	resp, err := n.client.Do(req)
	if err != nil {
		return Address{}, fmt.Errorf("nominatim request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Address{}, fmt.Errorf("nominatim status %d", resp.StatusCode)
	}
	var body nominatimResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Address{}, fmt.Errorf("nominatim response: %w", err)
	}
	a := parse(body)

	n.mu.Lock()
	if len(n.order) >= cacheSize {
		delete(n.cache, n.order[0])
		n.order = n.order[1:]
	}
	n.cache[key] = a
	n.order = append(n.order, key)
	n.mu.Unlock()
	return a, nil
}

func parse(r nominatimResponse) Address {
	first := func(keys ...string) string {
		for _, k := range keys {
			if v := strings.TrimSpace(r.Address[k]); v != "" {
				return v
			}
		}
		return ""
	}
	a := Address{
		Road: first("road", "pedestrian", "footway", "path", "residential"),
		Area: first("suburb", "neighbourhood", "quarter", "city_district", "hamlet"),
		City: first("city", "town", "village", "county"),
	}
	// OSM often labels Nairobi areas "Kilimani division" or "Kibera location".
	for _, suffix := range []string{" division", " sub-location", " location", " ward"} {
		a.Area = strings.TrimSuffix(a.Area, suffix)
	}
	if name := strings.TrimSpace(r.Name); name != "" && name != a.Road && name != a.Area {
		a.Place = name
	}
	return a
}
