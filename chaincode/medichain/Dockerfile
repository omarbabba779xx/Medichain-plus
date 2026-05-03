# ── Stage 1 : compilation ──────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /chaincode

# Copier les sources (go mod tidy résout tout + télécharge les deps)
COPY go.mod *.go ./
ENV CGO_ENABLED=0
RUN go mod tidy && go build -o /bin/chaincode .

# ── Stage 2 : image légère ─────────────────────────────────────────────────────
FROM alpine:3.18

COPY --from=builder /bin/chaincode /usr/local/bin/chaincode

EXPOSE 7052

CMD ["/usr/local/bin/chaincode"]
