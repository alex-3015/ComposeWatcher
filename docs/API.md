# Compose Watcher API v3

Alle IDs haben das Format `<relative-compose-datei>::<service>` und müssen als Pfadsegment URL-kodiert werden. Erfolgreiche Antworten enthalten `data`; Fehler enthalten ausschließlich `error.code` und `error.message`.

## Containerliste

`GET /api/containers`

Die Liste enthält bewusst keine Release Notes, keine Breaking-Change-Objekte und kein `historyComplete`.

```json
{
  "data": [
    {
      "id": "media/compose.yml::sonarr",
      "name": "sonarr",
      "image": "lscr.io/linuxserver/sonarr:4.0.0",
      "currentVersion": "4.0.0",
      "composeFile": "media/compose.yml",
      "githubRepo": "linuxserver/docker-sonarr",
      "iconUrl": "/icons/sonarr.png",
      "latestUpstreamVersion": "4.1.0",
      "publishedAt": "2026-07-13T12:00:00.000Z",
      "status": "update-available",
      "dataState": "fresh",
      "updateKind": "minor",
      "comparisonMode": "exact",
      "checkIssue": null,
      "breakingChangeCount": 0,
      "releaseUrl": "https://github.com/linuxserver/docker-sonarr/releases/tag/4.1.0",
      "lastChecked": "2026-07-13T12:01:00.000Z"
    }
  ],
  "meta": {
    "refresh": {
      "state": "idle",
      "scope": "all",
      "containerId": null,
      "startedAt": "2026-07-13T12:00:00.000Z",
      "finishedAt": "2026-07-13T12:01:00.000Z",
      "error": null
    },
    "refreshedAt": "2026-07-13T12:01:00.000Z",
    "githubRateLimit": {
      "limit": 5000,
      "remaining": 4988,
      "resetAt": "2026-07-13T13:00:00.000Z",
      "observedAt": "2026-07-13T12:01:00.000Z"
    }
  }
}
```

## Containerdetails

`GET /api/containers/:id`

`data` erweitert dieselbe Summary um:

```json
{
  "historyComplete": true,
  "releaseName": "Sonarr 4.1.0",
  "releaseNotes": "## Changes\n...",
  "breakingChanges": [
    {
      "version": "5.0.0",
      "releaseName": "Sonarr 5",
      "reason": "Major version bump: 4.0.0 → 5.0.0",
      "releaseUrl": "https://github.com/example/repo/releases/tag/5.0.0"
    }
  ]
}
```

Eine unbekannte ID liefert HTTP 404 mit `CONTAINER_NOT_FOUND`.

## Refresh

`POST /api/refresh` hat keinen Body. Die Antwort ist HTTP 202:

```json
{
  "data": {
    "state": "running",
    "scope": "all",
    "containerId": null,
    "startedAt": "2026-07-13T12:00:00.000Z",
    "finishedAt": null,
    "error": null
  }
}
```

Gleichzeitige Anfragen joinen denselben globalen Lauf. Der Client pollt `GET /api/containers`, bis `meta.refresh.state` nicht mehr `running` ist.

## Repository-Zuordnung

`PUT /api/containers/:id/repository`

```json
{ "repo": "owner/repository" }
```

Mit `{ "repo": null }` wird die automatische Zuordnung explizit entfernt. Die HTTP-202-Antwort enthält die sofort aktualisierte Summary und `meta.refresh`; nur der betroffene Container wird anschließend geprüft.

## Health

`GET /api/health`

```json
{ "data": { "status": "ok", "version": "3.0.0" } }
```

Der Endpunkt führt keine Dateizugriffe, Scans oder GitHub-Anfragen aus.
