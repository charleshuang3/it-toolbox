# List available recipes
default:
    @just --list

# Build backend and frontend
build: build-backend build-frontend

# Build Go backend binary
build-backend:
    cd backend && go build -o bin/it-toolbox ./cmd/main.go

# Build frontend production bundle
build-frontend:
    cd frontend && npm run build

# Run linters for backend and frontend
lint: lint-backend lint-frontend

# Lint backend code using go vet
lint-backend:
    cd backend && go vet ./...

# Lint frontend code using oxlint
lint-frontend:
    cd frontend && npm run lint

# Run backend and frontend tests
test: test-backend test-frontend

# Run backend tests
test-backend:
    cd backend && go test -v ./...

# Run frontend tests
test-frontend:
    cd frontend && npm run test:run

# Format backend and frontend code
fmt: fmt-backend fmt-frontend

# Format backend Go code
fmt-backend:
    cd backend && go fmt ./...

# Format frontend code using oxfmt
fmt-frontend:
    cd frontend && npm run fmt

# Check formatting without modifying files
fmt-check: fmt-check-backend fmt-check-frontend

# Check backend Go code formatting
fmt-check-backend:
    @test -z "$(gofmt -l backend)" || (echo "Unformatted Go files found:" && gofmt -l backend && exit 1)

# Check frontend code formatting
fmt-check-frontend:
    cd frontend && npm run fmt:check

# Run frontend TypeScript type checking
typecheck:
    cd frontend && npm run typecheck

# Clean build artifacts
clean:
    rm -rf backend/bin frontend/dist
