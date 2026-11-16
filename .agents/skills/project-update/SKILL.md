---
name: project-update
description: >-
  Runbook for updating dependencies, toolchains, Docker base images, and GitHub
  Actions in the it-toolbox repository. Use when the user asks to update project
  dependencies, upgrade Go/Node/pnpm/Docker/CI versions, or perform a routine
  dependency audit and bump.
---

# Project Update Runbook

Use this workflow when updating dependencies, runtime toolchains, Docker images,
or GitHub Actions across the `it-toolbox` repository (`backend/` and
`frontend/`).

Never edit lockfiles (`frontend/pnpm-lock.yaml`, `backend/go.sum`) by hand.

## 1. Go Dependencies (`backend/`)

1. **Check current & outdated dependencies**:
   ```bash
   cd backend && go list -u -m -f '{{if and (not .Indirect) .Update}}{{.Path}}: {{.Version}} -> {{.Update.Version}}{{end}}' all
   ```
2. **Update Go dependencies**:
   - Routine minor/patch/compatible updates:
     ```bash
     just update-go-deps
     ```
     (`just update-go-deps` runs `go get -u -t ./...` in `backend/`, then runs
     `just tidy`.)
   - For targeted or major version bumps, run `go get <pkg>@<version>` inside
     `backend/`, then run `just tidy`.
3. **Check for Go vulnerabilities**:
   ```bash
   cd backend && go run golang.org/x/vuln/cmd/govulncheck@latest ./...
   ```
4. **Check Go toolchain version**:
   - Check the `go X.Y.Z` directive in `backend/go.mod`.
   - Keep the Go version aligned across `backend/go.mod`, `Dockerfile`,
     `.github/workflows/test-on-push.yml`, and `README.md` (`Prerequisites`).

## 2. Web Dependencies (`frontend/` with `pnpm`)

Always use `pnpm` (never `npm` or `yarn`).

1. **Check outdated packages**:
   ```bash
   cd frontend && pnpm outdated
   ```
2. **Update dependencies**:
   - Compatible updates within `package.json` ranges:
     ```bash
     just update-pnpm-deps
     ```
     (Or run `just update-deps` to update both Go and pnpm dependencies.)
   - Major/latest updates (review breaking changes first for `vue`,
     `vue-router`, `vite`, `vitest`, `typescript`, `vue-tsc`, `tailwindcss`,
     `daisyui`, `oxlint`, `oxfmt`, etc.):
     ```bash
     cd frontend && pnpm update --latest <pkg>
     ```
3. **Audit production dependencies**:
   ```bash
   cd frontend && pnpm audit --prod --audit-level=high
   ```
4. **Check Node & pnpm versions**:
   - Check `frontend/package.json` (`packageManager`).
   - Keep aligned with `Dockerfile`, `.github/workflows/test-on-push.yml`, and
     `README.md` (`Prerequisites`).

## 3. Docker Dependencies & Base Images

Inspect and update `Dockerfile`:

- `FROM golang:<ver>-alpine AS builder-backend`
- `FROM node:<ver>-alpine AS builder-frontend` and `npm install -g pnpm@<ver>`
- `FROM alpine:latest AS deploy` (and `apk --no-cache add ca-certificates`)

Checklist:
- Verify the latest stable tags for `golang:*-alpine`, `node:*-alpine`, and
  `alpine:*`.
- Ensure `GO_VERSION`, `NODE_VERSION`, and `PNPM_VERSION` match across
  `Dockerfile`, `.github/workflows/test-on-push.yml`, `frontend/package.json`,
  and `README.md`.
- Build the image locally to verify:
  ```bash
  docker build -t it-toolbox:local .
  ```

## 4. GitHub Actions & CI-Installed Dependencies

Inspect all workflow files under `.github/workflows/` (`test-on-push.yml`,
`docker.yml`) and `.github/dependabot.yml`.

1. **CI-installed tool & runtime versions** (`.github/workflows/test-on-push.yml` `env:`):
   - `GO_VERSION`
   - `GOIMPORTS_VERSION` (`golang.org/x/tools/cmd/goimports@...`)
   - `GOLANGCI_LINT_VERSION`
   - `NODE_VERSION`
   - `PNPM_VERSION`
2. **GitHub Action versions**:
   - `.github/workflows/test-on-push.yml`:
     - `actions/checkout`
     - `actions/setup-go`
     - `pnpm/setup`
   - `.github/workflows/docker.yml`:
     - `actions/checkout`
     - `docker/login-action`
     - `docker/metadata-action`
     - `docker/build-push-action`
     - `actions/attest-build-provenance`
   - Check latest action versions with `gh`:
     ```bash
     for repo in \
       actions/checkout \
       actions/setup-go \
       pnpm/setup \
       docker/login-action \
       docker/metadata-action \
       docker/build-push-action \
       actions/attest-build-provenance
     do
       tag=$(gh api "repos/$repo/releases/latest" --jq '.tag_name')
       echo "$repo: $tag"
     done
     ```

## 5. Verification

Run the full local suite after all updates:

```bash
just fmt-check lint typecheck build test
```

If `Dockerfile` was modified, also run:

```bash
docker build -t it-toolbox:local .
```

Check `git status` and `git diff` to verify only expected files changed, and
commit using conventional commits (e.g., `chore(deps): ...` or `ci: ...`).
