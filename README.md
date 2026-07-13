# ComposeWatcher

A self-hosted web dashboard that scans your Docker Compose files, compares running container image tags against GitHub releases, and highlights available updates — including breaking changes.

![Status](https://img.shields.io/badge/status-active-brightgr)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/K3K01VQRQJ)

## Features

- Automatically scans a directory of Docker Compose files for container images
- Compares current image tags against latest GitHub releases using semantic versioning
- Detects **breaking changes** (major version bumps, keywords like "breaking change", "migration required" in release notes)
- Filter containers by status: up-to-date, update available, breaking change, unknown
- Persistent repository mappings stored in a JSON config file
- Deduplicated, concurrency-limited GitHub checks for fast refreshes on larger installations
- Stale-while-revalidate caching that keeps the dashboard responsive during background checks
- Actionable diagnostics for rate limits, network failures, invalid releases, and unverifiable tags

![screenshot.png](screenshot/screenshot.png)

## Status Values

| Status | Description |
|---|---|
| `up-to-date` | Current tag matches latest release |
| `update-available` | Newer release exists (minor/patch) |
| `breaking-change` | Major version bump or breaking change detected in release notes |
| `unknown` | Could not determine status (e.g. `latest`, digests, variables, non-comparable tags, or a failed GitHub check) |
| `no-repo` | No GitHub repository linked yet |

## Getting Started

### Prerequisites

- Docker & Docker Compose

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/ComposeWatcher.git
   cd ComposeWatcher
   ```

2. Edit `docker-compose.yml` and set the volume path to your Docker Compose directory:
   ```yaml
   volumes:
     - /your/docker/folder:/docker:ro   # <-- Change this
   ```

3. Start the stack:
   ```bash
   docker compose up -d
   ```

4. Open [http://localhost:8555](http://localhost:8555)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DOCKER_DIR` | `/docker` | Path to the directory containing Docker Compose files |
| `DATA_DIR` | `/data` | Path for the persistent config JSON |
| `PORT` | `3000` | Backend server port |
| `GITHUB_TOKEN` | _(none)_ | GitHub personal access token — raises API rate limit from 60 to 5 000 req/hour |
| `CORS_ORIGIN` | _(disabled)_ | Optional comma-separated CORS allowlist. Use `*` only when intentionally exposing the backend cross-origin. |
| `CACHE_TTL_MS` | `300000` | Cache time-to-live in milliseconds (default: 5 minutes) |
| `GITHUB_CONCURRENCY` | `5` | Maximum concurrent GitHub requests. Values are clamped to the range 1–20. |

### GitHub API Rate Limits

Without a token, GitHub's API allows only **60 requests per hour per IP address**. Each unique linked repository consumes at most one request per refresh. When the limit is reached, affected cards show a reason and the dashboard displays a combined warning.

**Setting a token is strongly recommended for any real-world deployment.**

To create a token: GitHub → Settings → Developer Settings → Personal access tokens → Fine-grained tokens. No specific scopes are required for public repositories.

```yaml
# docker-compose.yml
environment:
  - GITHUB_TOKEN=ghp_your_token_here
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/containers` | Returns all containers with update status |
| `GET` | `/api/containers?refresh=true` | Bypasses cache and fetches fresh data |
| `POST` | `/api/containers/:id/repo` | Link or unlink a GitHub repo (`{ repo: "owner/repo" \| null }`) |
| `GET` | `/api/config` | Returns current repository mappings |
| `GET` | `/api/health` | Lightweight liveness check; never scans files or calls GitHub |

All successful endpoints use a `{ "data": ... }` envelope. Container responses also include cache metadata:

```json
{
  "data": [],
  "meta": {
    "stale": false,
    "refreshing": false,
    "refreshedAt": "2026-07-13T14:00:00.000Z",
    "refreshError": null
  }
}
```

Repository mapping response:

```json
{ "data": { "id": "sonarr/docker-compose.yml::sonarr", "githubRepo": "linuxserver/sonarr" } }
```

Configuration and health responses:

```json
{ "data": { "repoMappings": {} } }
{ "data": { "status": "ok" } }
```

Errors are stable, machine-readable objects:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request." } }
```

## How It Works

1. The backend scans all `docker-compose*.yml` files in the configured `DOCKER_DIR`
2. For each container image, it attempts to infer the GitHub repository from the image name
3. Linked repositories are deduplicated and checked through a bounded parallel worker pool
4. Comparable semantic versions are evaluated; ambiguous tags remain `unknown` instead of producing false update alerts
5. Release notes are scanned for breaking change indicators
6. Fresh results are cached in memory and on disk; expired results are served immediately while revalidation runs in the background

## Persistent Storage

Repository mappings are stored in a Docker volume at `/data/config.json`. This persists across container restarts. Config writes are atomic (write to tmp file + rename) to prevent corruption on unexpected shutdowns. The separate result cache is versioned and is rebuilt automatically when an incompatible format is found.

## Container Security

The container runs with a non-root user (`appuser`) and includes:

- **tini** as PID 1 for proper signal forwarding and zombie process reaping
- **HEALTHCHECK** on `/api/health` (30s interval, no external dependencies)
- **Security headers** via nginx: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`

Graceful shutdown is supported — `docker stop` cleanly terminates both nginx and the Node.js backend.

## Browser Support

The Tailwind CSS 4 frontend targets Safari 16.4+, Chrome 111+, and Firefox 128+.

## License

MIT
