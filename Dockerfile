# Stage 1: Build Go backend
FROM golang:1.26-alpine AS builder-backend

WORKDIR /build/backend

# Copy go mod files
COPY backend/go.mod backend/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY backend/cmd ./cmd
COPY backend/config ./config
COPY backend/handlers ./handlers

# Build the Go application
RUN CGO_ENABLED=0 GOOS=linux go build -o it-toolbox ./cmd/main.go

# Stage 2: Build frontend
FROM node:25-alpine AS builder-frontend

WORKDIR /build/frontend

# Copy package files
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/src ./src
COPY frontend/index.html ./
COPY frontend/vite.config.ts ./
COPY frontend/tsconfig.json ./
COPY frontend/tsconfig.app.json ./
COPY frontend/tsconfig.node.json ./
COPY frontend/eslint.config.ts ./
COPY frontend/.prettierrc ./
COPY frontend/.env ./

# Build the frontend
RUN npm run build

# Stage 3: Deploy
FROM alpine:latest AS deploy

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy backend binary from builder stage
COPY --from=builder-backend /build/backend/it-toolbox /app/it-toolbox

# Copy frontend build from builder stage
COPY --from=builder-frontend /build/frontend/dist /app/frontend

# Default command - run the backend with simple config
CMD ["/app/it-toolbox"]
