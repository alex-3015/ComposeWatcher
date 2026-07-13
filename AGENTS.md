# AGENTS.md

Repository guidance for Compose Watcher v3.

## Commands

Run workspace-wide checks from the repository root:

```bash
npm ci
npm run check          # format, lint, typecheck, coverage, production build
npm run test           # contracts + backend + frontend
npm run test:e2e       # Playwright against the mutable Vite mock API
npm run build
docker compose up --build
```

Package-specific commands use `--workspace @composewatcher/contracts`, `@composewatcher/backend`, or `@composewatcher/frontend`. Run a single Vitest file from its package directory with `npx vitest run <path>`.

`frontend` commands:

```bash
npm run dev             # proxies /api to Fastify on localhost:8080
npm run dev:mock        # mutable in-process v3 mock API, no backend required
```

## Architecture

The root is an npm workspace with one lockfile:

- `contracts`: TypeBox 1.x schemas and static public API types; public contract source of truth
- `backend`: Fastify 5 API, catalog, refresh coordination, persistence, and static SPA serving
- `frontend`: Vue 3 dashboard; imports contracts as types only

The production container has one Node.js process on port 8080. Fastify serves `/api`, `frontend/dist`, and `/icons`; nginx and shell supervision are not used.

### Backend flow

1. `ContainerCatalog.initialize` loads config, scans Compose files, and reads a compatible snapshot concurrently.
2. A list request returns the current in-memory summaries immediately; stale data starts background revalidation.
3. `githubService` deduplicates repositories; `githubClient` applies concurrency, ETags, timeout, and rate-limit backoff.
4. `domain/versionComparison` normalizes releases and derives update/breaking status.
5. Mapping revisions prevent an older global run from replacing a newer targeted repository mapping.
6. JSON stores use `fs/promises` and atomic temp-file rename. Cache schemas are versioned; valid `repoMappings` survive v2 upgrades.

Global refreshes coalesce. Repository changes enrich only one container. Shutdown aborts both global and targeted requests.

### API

- `GET /api/health`: I/O-free liveness
- `GET /api/containers`: lean `ContainerSummary[]` and refresh metadata
- `GET /api/containers/:id`: on-demand `ContainerDetail`
- `POST /api/refresh`: immediate HTTP 202
- `PUT /api/containers/:id/repository`: immediate summary and targeted check, HTTP 202

Removed v2 surfaces: `GET /api/config`, `?refresh=true`, and `POST .../:id/repo`. Errors remain `{ error: { code, message } }`.

Container IDs are `<relative-compose-path>::<service-name>` and URL-encoded in routes.

### Frontend

The initial collection must not contain release notes or breaking-change objects. `ContainerDetailPanel` triggers the detail request and lazy-loads `ReleaseNotes.vue`; this keeps `marked` and DOMPurify out of the initial chunk. Preserve focus trap, Escape close, focus restoration, and full-width mobile behavior.

Search covers name, image, repository, and Compose file. Filters are `all`, `breaking`, `updates`, `attention`, and `current`. Do not add persistent triage state.

### Tests and budgets

- Backend: Vitest Node environment
- Frontend: Vitest happy-dom environment
- Browser smoke: Playwright against `dev:mock`
- Coverage: at least 80% for branches, functions, lines, and statements per tested workspace
- 100-container uncompressed list response: at most 150 kB
- Initial frontend JavaScript: under 70 kB gzip

Keep internal `ContainerInfo` in `backend/src/types.ts`; never mirror public API types manually. Change public schemas in `contracts/src/index.ts` first and update contract/API tests with them.
