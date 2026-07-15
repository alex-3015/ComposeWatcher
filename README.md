# Compose Watcher

Compose Watcher is a self-hosted dashboard that scans Docker Compose files and compares image tags with GitHub Releases. It highlights available updates, breaking changes, failed checks, and stale data.

![Compose Watcher dashboard](screenshot/screenshot.png)

## Features

- Recursively scans `compose.yml`, `compose.yaml`, `docker-compose.yml`, and `docker-compose.yaml`
- Resolves image variables from the `.env` file next to each Compose file
- Detects GitHub repositories automatically and supports manual mappings
- Shows update status, breaking changes, release notes, and data freshness
- Exposes aggregate update counts for a Homepage custom API widget
- Provides search, filters, compact and card views, and a responsive detail panel
- Caches results and refreshes GitHub data in the background

## Run with Docker Compose

1. In `docker-compose.yml`, replace `/path/to/your/docker/folder` with the directory containing your Compose files.
2. Start Compose Watcher:

```bash
docker compose up -d --build
```

3. Open [http://localhost:8555](http://localhost:8555).

To use the published image instead of building locally, use `docker-compose.example.yaml`. Set `COMPOSEWATCHER_PORT` to change the host port.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPOSEWATCHER_PORT` | `8555` | Host port used by Docker Compose |
| `DOCKER_DIR` | `/docker` | Directory scanned for Compose files |
| `DATA_DIR` | `/data` | Persistent configuration and cache directory |
| `GITHUB_TOKEN` | — | Optional token for a higher GitHub API rate limit |
| `GITHUB_CONCURRENCY` | `5` | Concurrent GitHub requests (`1`–`20`) |
| `CACHE_TTL_MS` | `300000` | Time before cached data is refreshed |
| `CORS_ORIGIN` | — | Optional comma-separated origin allowlist |

GitHub Releases are the only update source. Digests, rolling tags such as `latest`, and unresolved variables are reported as not comparable.

## Development

Requires Node.js 24 or later.

```bash
npm ci
npm run check
npm run test:e2e
```

Run the frontend with its local mock API:

```bash
npm run dev:mock --workspace @composewatcher/frontend
```

See [docs/API.md](docs/API.md) for the v3 API.

## Homepage widget

Compose Watcher exposes `GET /api/homepage` for Homepage's `customapi` service widget. Add the following widget to the existing Compose Watcher entry in `services.yaml`:

```yaml
- Monitoring & Betrieb:
    - Compose Watcher:
        icon: compose-watcher.png
        href: https://composewatcher.example.com
        widget:
          type: customapi
          url: http://composewatcher:8080/api/homepage
          refreshInterval: 30000
          mappings:
            - field: data.breaking
              label: Breaking
              format: number
            - field: data.updates
              label: Updates
              format: number
            - field: data.checkFailed
              label: Check failed
              format: number
```

Use the browser-reachable Compose Watcher URL for `href`. The widget `url` is requested by the Homepage server, so use the Compose Watcher container name and port when both applications share a Docker network, or a host/IP address such as `http://192.168.1.10:8555/api/homepage` otherwise. No CORS setting is required for Homepage's server-side proxy.

## License

MIT
