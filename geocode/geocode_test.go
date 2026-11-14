package geocode

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestNominatimParsesAndCaches(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("User-Agent") == "" {
			t.Error("missing User-Agent")
		}
		_, _ = w.Write([]byte(`{"name":"Prestige Plaza","address":{"road":"Ngong Road","suburb":"Kilimani division","city":"Nairobi"}}`))
	}))
	defer srv.Close()

	n := NewNominatim(srv.URL, "Flow test", "")
	for i := 0; i < 2; i++ {
		a, err := n.Reverse(context.Background(), -1.29903, 36.78702)
		if err != nil {
			t.Fatal(err)
		}
		want := Address{Road: "Ngong Road", Place: "Prestige Plaza", Area: "Kilimani", City: "Nairobi"}
		if a != want {
			t.Fatalf("got %+v, want %+v", a, want)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("second lookup should come from the cache; server called %d times", calls.Load())
	}
}

func TestParseSkipsNameThatIsJustTheRoad(t *testing.T) {
	a := parse(nominatimResponse{Name: "Moi Avenue", Address: map[string]string{"road": "Moi Avenue", "city": "Nairobi"}})
	if a.Place != "" || a.Road != "Moi Avenue" {
		t.Fatalf("got %+v", a)
	}
}
