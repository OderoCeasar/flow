package db

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"flow/db/dbtest"
)

var (
	testPool  *pgxpool.Pool
	testStore Store
)

func TestMain(m *testing.M) {
	if os.Getenv("SKIP_DB_TESTS") != "" {
		fmt.Println("SKIP_DB_TESTS set; skipping store integration tests")
		os.Exit(0)
	}
	pool, stop, err := dbtest.Start(context.Background())
	if err != nil {
		fmt.Fprintln(os.Stderr, "start postgis:", err)
		os.Exit(1)
	}
	testPool, testStore = pool, NewStore(pool)
	code := m.Run()
	stop()
	os.Exit(code)
}
