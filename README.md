# IT Toolbox

A modern web application providing a collection of useful developer tools in a single, easy-to-use interface.

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Vite, DaisyUI
- **Backend**: Go (Golang)
- **Server**: Caddy (for local development)

## Development

### Prerequisites

- Go 1.26+
- Node.js 25+
- Docker (for building the container)

### Local Development

1. **Start the backend**:

   ```bash
   cd backend
   go run ./cmd/main.go
   ```

   The backend runs on port 8888 by default.

2. **Start the frontend** (in a separate terminal):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   The frontend development server runs on port 5173 by default.

3. **Use Caddy for reverse proxy** (optional):

   ```bash
   caddy run --config Caddyfile
   ```

   This sets up reverse proxying:
   - `http://localhost:8881` - Main application
   - `http://localhost:8881/api/*` - Backend API

### Running Tests

```bash
# Backend tests
cd backend
go test ./...

# Frontend tests
cd frontend
npm test
```

## Deployment

To deploy using Docker:

```bash
docker pull ghcr.io/charleshuang3/it-toolbox:main
```

Then run the container with your configuration:

```bash
docker run -d -p 8080:8080 -v /path/to/config.yaml:/app/config/config.yaml ghcr.io/charleshuang3/it-toolbox:main
```

### Configuration

The application requires a configuration file at `/app/config/config.yaml`. The configuration should include:

```yaml
port: 8080
debug: false
frontend_file_path: ./frontend
jwks:
  issuer: https://your-domain.com/api/jwt
```

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt) for details.
