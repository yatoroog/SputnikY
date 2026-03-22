FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN for attempt in 1 2 3; do \
      go mod download && exit 0; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      echo "go mod download failed, retrying..." >&2; \
      sleep 2; \
    done

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/server ./cmd/server

FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/server .
COPY --from=builder /app/data/ ./data/

EXPOSE 8080

ENV PORT=8080

CMD ["./server"]
