up:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down -v

deps:
	docker compose up -d db minio

env:
	test -f app.env || cp app.env.example app.env

sqlc:
	sqlc generate

new_migration:
	migrate create -ext sql -dir db/migrations -seq $(name)

test:
	go test -cover ./...

run: env
	go run .

worker: env
	go run ./cmd/worker

web:
	cd web && npm run dev

e2e:
	cd e2e && npx playwright test

.PHONY: up down reset deps env sqlc new_migration test run worker web e2e
