# Compose Watcher v3

Compose Watcher ist ein selbst gehostetes Aktions-Dashboard für Homelabs. Es liest Docker-Compose-Dateien, vergleicht Image-Tags ausschließlich mit GitHub Releases und zeigt Updates, Breaking Changes sowie unsichere oder veraltete Prüfdaten sichtbar an.

v3 ersetzt die v2-API inkompatibel. Bestehende gültige Repository-Zuordnungen werden übernommen; alte Snapshot- und GitHub-Caches werden anhand ihrer Schemaversion verworfen.

![Compose-Watcher-Dashboard](screenshot/screenshot.png)

## Funktionen

- Schneller Start aus Compose-Dateien und kompatiblen Snapshots; GitHub wird danach im Hintergrund aktualisiert
- Ein GitHub-Request pro eindeutigem Repository mit begrenzter Parallelität, ETags und Rate-Limit-Backoff
- Race-freie globale und gezielte Refreshes; eine neue Repository-Zuordnung kann nicht von einem alten Lauf überschrieben werden
- Kompakte Listen-API und bei Bedarf geladene Release Notes, Diagnosen und Breaking-Change-Historie
- Aktionsfilter: Alle, Breaking, Updates, Benötigt Aufmerksamkeit und Aktuell
- Suche über Name, Image, Repository und Compose-Datei sowie Karten- und Kompaktansicht
- Responsives Detailpanel mit Fokusfalle, Escape-Schließen, Fokuswiederherstellung und mobiler Vollbildansicht
- Sichtbare Datenfrische (`pending`, `fresh`, `stale`, `error`, `unlinked`) und Vergleichssicherheit
- Ein einzelner Fastify-Prozess für API, SPA, Icons, Kompression und Security Header

## Installation mit Docker Compose

1. Passe in `docker-compose.yml` den schreibgeschützten Mount auf dein Compose-Verzeichnis an.
2. Starte den Dienst:

```bash
docker compose up -d --build
```

3. Öffne [http://localhost:8555](http://localhost:8555).

Ein fertiges Image-Beispiel liegt in `docker-compose.example.yaml`. Der Host-Port lässt sich setzen:

```bash
COMPOSEWATCHER_PORT=9000 docker compose up -d
```

## Umgebungsvariablen

| Variable              |  Standard | Bedeutung                                                          |
| --------------------- | --------: | ------------------------------------------------------------------ |
| `COMPOSEWATCHER_PORT` |    `8555` | Host-Port in den Compose-Dateien; keine Container-Variable         |
| `PORT`                |    `8080` | Interner Fastify-Port                                              |
| `DOCKER_DIR`          | `/docker` | Rekursiv gescanntes Compose-Verzeichnis                            |
| `DATA_DIR`            |   `/data` | Persistente Konfiguration, Snapshots und Icons                     |
| `GITHUB_TOKEN`        |         – | Optionales GitHub-Token; für größere Installationen empfohlen      |
| `GITHUB_CONCURRENCY`  |       `5` | Parallele GitHub-Anfragen, begrenzt auf 1–20                       |
| `CACHE_TTL_MS`        |  `300000` | Zeit bis zur Hintergrund-Revalidierung in Millisekunden            |
| `CORS_ORIGIN`         |         – | Optionale, kommaseparierte Origin-Allowlist; `*` bewusst verwenden |

Ohne Token erlaubt GitHub für öffentliche Requests typischerweise deutlich weniger Anfragen. Compose Watcher dedupliziert Repositories und zeigt verbleibendes Budget sowie Retry-Zeitpunkte im Dashboard.

## Persistente Daten

- `/data/config.json`: manuelle Repository-Zuordnungen, einschließlich expliziter Entknüpfungen
- `/data/cache.json`: versionierter Container-Snapshot für den schnellen Start
- `/data/github-cache.json`: versionierte ETags und kompakte Release-Daten für Stale-on-Error
- `/data/icons/`: lokal geladene Icons

Alle JSON-Schreibvorgänge erfolgen atomar über temporäre Dateien und `rename`. Inkompatible v2-Caches werden ignoriert und neu aufgebaut.

## Status und Datenzustand

`ContainerStatus` bleibt: `up-to-date`, `ahead`, `update-available`, `breaking-change`, `unknown`, `no-repo`.

`DataState` erklärt die Verlässlichkeit der angezeigten GitHub-Daten:

| Zustand    | Bedeutung                        |
| ---------- | -------------------------------- |
| `pending`  | Prüfung läuft                    |
| `fresh`    | letzte Prüfung erfolgreich       |
| `stale`    | Cache-Daten nach einem Fehler    |
| `error`    | Prüfung fehlgeschlagen           |
| `unlinked` | kein GitHub-Repository verknüpft |

GitHub Releases sind die einzige Updatequelle. Ein neuer GitHub Release garantiert nicht, dass bereits ein passender Registry-Tag existiert. Nicht vergleichbare Tags wie `latest`, Digests oder Variablen bleiben deshalb `unknown`.

## API

Die v3-API verwendet Erfolgs-Envelopes mit `data` und Fehler im Format:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request." } }
```

Wichtige Endpunkte:

| Methode | Pfad                             | Ergebnis                                                   |
| ------- | -------------------------------- | ---------------------------------------------------------- |
| `GET`   | `/api/health`                    | I/O-freie Liveness-Antwort                                 |
| `GET`   | `/api/containers`                | kompakte `ContainerSummary[]` plus Refresh-Metadaten       |
| `GET`   | `/api/containers/:id`            | `ContainerDetail` bei Bedarf                               |
| `POST`  | `/api/refresh`                   | startet/joint einen Lauf, antwortet mit HTTP 202           |
| `PUT`   | `/api/containers/:id/repository` | speichert `{ "repo": "owner/repo" }` oder `null`, HTTP 202 |

Die vollständigen Verträge und Beispiele stehen in [docs/API.md](docs/API.md). `GET /api/config`, `?refresh=true` und der alte `/repo`-Endpunkt existieren nicht mehr.

## Entwicklung

Node.js 24 oder neuer wird benötigt. Das Repository verwendet npm Workspaces und genau ein Lockfile.

```bash
npm ci
npm run check          # Format, Lint, Typecheck, Coverage und Produktionsbuild
npm run test           # alle Unit-/Vertragstests
npm run test:e2e       # Playwright gegen den Vite-Mock-Server
```

Für die lokale UI ohne Backend:

```bash
npm run dev:mock --workspace @composewatcher/frontend
```

Der normale Vite-Server leitet `/api` an Fastify auf Port 8080 weiter. CI prüft Format, Lint, Typecheck, mindestens 80 % Coverage, Produktionsbuild, Playwright, Docker-Build und einen Container-Health-Smoke-Test.

## Sicherheit und Shutdown

Der Container läuft als Benutzer `node`, verwendet `tini` als PID 1 und beendet laufende GitHub-Anfragen bei `SIGTERM`/`SIGINT`. Fastify Helmet setzt die Security Header, `@fastify/compress` komprimiert Antworten und `/api/health` führt weder Dateizugriffe noch externe Requests aus.

## Lizenz

MIT
