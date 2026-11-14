FROM golang:1.26.10-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . ./

ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /flow-api . \
 && go build -trimpath -ldflags="-s -w" -o /flow-worker ./cmd/worker

FROM alpine:3.22
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 flow

COPY --from=builder /flow-api /flow-worker ./
COPY db/migrations ./db/migrations

# app.env is intentionally NOT copied: in containers all configuration comes
# from environment variables (see docker-compose.yml).
USER flow
EXPOSE 8081
CMD ["./flow-api"]
