package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store provides all functions to execute db queries and transactions
type Store interface {
	Querier
	// ExecTx runs fn inside one transaction; any error rolls it back.
	ExecTx(ctx context.Context, fn func(Querier) error) error
	Ping(ctx context.Context) error
}

// SQLStore provides all functions to execute SQL queries and transactions
type SQLStore struct {
	*Queries
	connPool *pgxpool.Pool
}

// NewStore creates a new Store
func NewStore(connPool *pgxpool.Pool) Store {
	return &SQLStore{
		Queries:  New(connPool),
		connPool: connPool,
	}
}

func (store *SQLStore) Ping(ctx context.Context) error {
	return store.connPool.Ping(ctx)
}
