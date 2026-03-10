# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`cd backend`)
```bash
npm run dev        # tsx watch — hot reload via tsx
npm run build      # tsc → dist/
npm run start      # node dist/index.js
npm run test       # vitest run (single pass)
npm run test:watch # vitest watch mode
```

### Frontend (`cd frontend`)
```bash
npm run dev        # vite dev server (proxies /api → localhost:3000)
npm run dev:mock   # vite dev server with mock API — no backend needed
npm run build      # vue-tsc -b && vite build → dist/
npm run test       # vitest run (single pass)
npm run test:watch # vitest watch mode
```

`dev:mock` activates `mock-plugin.ts` which intercepts all `/api/*` requests in the Vite dev server and returns data from `src/mocks/data.ts`. The mock state is mutable within a session — linking/unlinking a repo via the UI persists until the dev server restarts. Mock data covers all 5 status types: `up-to-date`, `update-available`, `breaking-change`, `unknown`, `no-repo`.

### Run a single test file
```bash
# backend
cd backend && npx vitest run src/services/__tests__/dockerService.test.ts

# frontend
cd frontend && npx vitest run src/__tests__/App.test.ts
```

### Docker
```bash
docker compose up --build   # builds both images, runs on host port 8555
```

## Architecture

The app is a **single docker-compose service** that bundles both a Node.js backend and an nginx-served Vue SPA. nginx serves the frontend on port 80 (exposed as 8555) and reverse-proxies `/api/` to the backend on port 3000.

### Data flow
1. On startup (or cache miss), `scanDockerDir` recursively finds all `docker-compose.{yml,yaml}` / `compose.{yml,yaml}` files under `DOCKER_DIR`.
2. For each service with an `image:` field, it parses the image name and infers a GitHub `owner/repo` via `inferGithubRepo` (known-mapping table + heuristics).
3. Manual overrides from `DATA_DIR/config.json` (`repoMappings`) replace auto-inferred repos.
4. `enrichWithGithubData` calls `GET /repos/{owner}/{repo}/releases/latest` for each container and fills in `latestVersion`, `status`, and `breakingChangeReason`.
5. Results are cached in memory for 5 minutes; `?refresh=true` bypasses the cache.

### Container ID format
`"<relative-compose-path>::<service-name>"` — e.g. `"sonarr/docker-compose.yml::sonarr"`. IDs are URL-encoded when used in the `POST /api/containers/:id/repo` route.

### Status values
`up-to-date` | `update-available` | `breaking-change` | `unknown` | `no-repo`

Breaking change is flagged when: (a) major semver bump, or (b) release notes contain keywords from `BREAKING_KEYWORDS` array in `githubService.ts`.

### Types
`backend/src/types.ts` is the source of truth for `ContainerInfo`, `Config`, and `GithubRelease`. The frontend has a mirror at `frontend/src/types.ts` — keep them in sync manually.

### Test environments
- Backend tests: `vitest` with `environment: 'node'` (config in `backend/vitest.config.ts`)
- Frontend tests: `vitest` with `environment: 'happy-dom'` (config inlined in `frontend/vite.config.ts`)
