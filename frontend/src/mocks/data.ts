import type { ContainerDetail, ContainerSummary } from '../types';

type DefaultedFields =
  | 'updateKind'
  | 'comparisonMode'
  | 'historyComplete'
  | 'breakingChanges'
  | 'dataState'
  | 'iconUrl'
  | 'breakingChangeCount';

function mockContainer(
  container: Omit<ContainerDetail, DefaultedFields> &
    Partial<Pick<ContainerDetail, DefaultedFields>>,
): ContainerDetail {
  const detail: ContainerDetail = {
    updateKind: null,
    comparisonMode: 'exact',
    historyComplete: true,
    breakingChanges: [],
    dataState: container.githubRepo ? 'fresh' : 'unlinked',
    iconUrl: `/icons/${encodeURIComponent(container.name)}.png`,
    breakingChangeCount: container.breakingChanges?.length ?? 0,
    ...container,
  };
  return { ...detail, breakingChangeCount: detail.breakingChanges.length };
}

export const mockContainerDetails: ContainerDetail[] = [
  mockContainer({
    id: 'media-stack/docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'lscr.io/linuxserver/sonarr',
    currentVersion: '4.0.9',
    composeFile: 'media-stack/docker-compose.yml',
    githubRepo: 'linuxserver/docker-sonarr',
    latestUpstreamVersion: '4.0.9',
    publishedAt: '2024-11-01T10:00:00Z',
    status: 'up-to-date',
    checkIssue: null,
    releaseUrl: 'https://github.com/linuxserver/docker-sonarr/releases/tag/4.0.9',
    releaseNotes:
      "## What's Changed\n- Fixed RSS sync edge case\n- Improved search performance\n- Updated translations",
    releaseName: 'v4.0.9',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'media-stack/docker-compose.yml::radarr',
    name: 'radarr',
    image: 'lscr.io/linuxserver/radarr',
    currentVersion: '5.2.6',
    composeFile: 'media-stack/docker-compose.yml',
    githubRepo: 'linuxserver/docker-radarr',
    latestUpstreamVersion: '5.11.0',
    publishedAt: '2025-01-15T08:30:00Z',
    status: 'update-available',
    checkIssue: null,
    updateKind: 'minor',
    releaseUrl: 'https://github.com/linuxserver/docker-radarr/releases/tag/5.11.0',
    releaseNotes:
      '## New Features\n- Added custom format support for IMAX Enhanced\n- New movie list import from Trakt\n\n## Bug Fixes\n- Fixed manual import not detecting quality\n- Resolved indexer sync timeout issue\n\n## Notes\nPlease update your `/config` volume permissions after upgrade.',
    releaseName: 'v5.11.0',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'gitea/docker-compose.yml::gitea',
    name: 'gitea',
    image: 'gitea/gitea',
    currentVersion: '1.21.4',
    composeFile: 'gitea/docker-compose.yml',
    githubRepo: 'go-gitea/gitea',
    latestUpstreamVersion: '2.0.0',
    publishedAt: '2025-02-20T14:00:00Z',
    status: 'breaking-change',
    checkIssue: null,
    updateKind: 'major',
    breakingChanges: [
      {
        version: '2.0.0',
        releaseName: 'Gitea 2.0.0 — The Big One',
        reason: 'Major version bump: 1.21.4 → 2.0.0',
        releaseUrl: 'https://github.com/go-gitea/gitea/releases/tag/v2.0.0',
      },
    ],
    releaseUrl: 'https://github.com/go-gitea/gitea/releases/tag/v2.0.0',
    releaseNotes:
      '## Breaking Changes\n- **Database migration required** — run `gitea migrate` before starting\n- Removed deprecated API endpoints: `/api/v1/repos/search` (use `/api/v1/repos` instead)\n- Minimum Go version is now 1.22\n\n## New Features\n- Gitea Actions is now stable\n- Package registry supports Cargo and Conda\n- New dashboard with activity graphs',
    releaseName: 'Gitea 2.0.0 — The Big One',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'vaultwarden/docker-compose.yml::vaultwarden',
    name: 'vaultwarden',
    image: 'vaultwarden/server',
    currentVersion: '1.30.5',
    composeFile: 'vaultwarden/docker-compose.yml',
    githubRepo: 'dani-garcia/vaultwarden',
    latestUpstreamVersion: '1.32.7',
    publishedAt: '2025-01-10T09:00:00Z',
    status: 'breaking-change',
    checkIssue: null,
    updateKind: 'minor',
    breakingChanges: [
      {
        version: '1.32.7',
        releaseName: 'v1.32.7',
        reason: 'Release notes mention: "breaking change"',
        releaseUrl: 'https://github.com/dani-garcia/vaultwarden/releases/tag/1.32.7',
      },
    ],
    releaseUrl: 'https://github.com/dani-garcia/vaultwarden/releases/tag/1.32.7',
    releaseNotes:
      '## Changes\n- **Breaking change**: `ADMIN_TOKEN` now requires Argon2 hashing — see [wiki](https://github.com/dani-garcia/vaultwarden/wiki)\n- Added emergency access support\n- Improved SMTP configuration validation\n\n```bash\n# Generate new admin token\nvaultwarden hash --preset owasp\n```',
    releaseName: 'v1.32.7',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'portainer/docker-compose.yml::portainer',
    name: 'portainer',
    image: 'portainer/portainer-ce',
    currentVersion: '2.21.0',
    composeFile: 'portainer/docker-compose.yml',
    githubRepo: 'portainer/portainer',
    latestUpstreamVersion: null,
    publishedAt: null,
    status: 'unknown',
    checkIssue: null,
    comparisonMode: 'unverifiable',
    historyComplete: null,
    releaseUrl: null,
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'myapp/docker-compose.yml::myapp',
    name: 'myapp',
    image: 'myregistry.local/myapp',
    currentVersion: '3.1.0',
    composeFile: 'myapp/docker-compose.yml',
    githubRepo: null,
    latestUpstreamVersion: null,
    publishedAt: null,
    status: 'no-repo',
    checkIssue: null,
    comparisonMode: 'unverifiable',
    historyComplete: null,
    releaseUrl: null,
    releaseNotes: null,
    releaseName: null,
    lastChecked: null,
  }),
  mockContainer({
    id: 'adguard/docker-compose.yml::adguardhome',
    name: 'adguardhome',
    image: 'adguard/adguardhome',
    currentVersion: 'v0.107.52',
    composeFile: 'adguard/docker-compose.yml',
    githubRepo: 'AdguardTeam/AdGuardHome',
    latestUpstreamVersion: 'v0.107.52',
    publishedAt: '2024-12-01T12:00:00Z',
    status: 'up-to-date',
    checkIssue: null,
    releaseUrl: 'https://github.com/AdguardTeam/AdGuardHome/releases/tag/v0.107.52',
    releaseNotes:
      '## Changelog\n- Fixed DNS-over-QUIC stability issues\n- Updated filter lists\n- Minor UI improvements',
    releaseName: 'AdGuard Home v0.107.52',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'nextcloud/docker-compose.yml::nextcloud',
    name: 'nextcloud',
    image: 'nextcloud',
    currentVersion: '27.1.7',
    composeFile: 'nextcloud/docker-compose.yml',
    githubRepo: 'nextcloud/nextcloud',
    latestUpstreamVersion: '30.0.4',
    publishedAt: '2025-01-20T11:00:00Z',
    status: 'breaking-change',
    checkIssue: null,
    updateKind: 'major',
    breakingChanges: [
      {
        version: '30.0.4',
        releaseName: 'Nextcloud Hub 8 (30.0.4)',
        reason: 'Major version bump: 27.1.7 → 30.0.4',
        releaseUrl: 'https://github.com/nextcloud/nextcloud/releases/tag/v30.0.4',
      },
    ],
    releaseUrl: 'https://github.com/nextcloud/nextcloud/releases/tag/v30.0.4',
    releaseNotes:
      '## Highlights\n- New AI-powered smart inbox\n- Improved file sharing UX\n- **Performance**: 40% faster file sync\n\n## Upgrade Notes\n1. Back up your data directory\n2. Run `occ upgrade`\n3. Clear caches with `occ maintenance:repair`',
    releaseName: 'Nextcloud Hub 8 (30.0.4)',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
  mockContainer({
    id: 'monitoring/docker-compose.yml::watchtower-helper',
    name: 'watchtower-helper',
    image: 'ghcr.io/example/watchtower-helper',
    currentVersion: '2.1.0',
    composeFile: 'monitoring/docker-compose.yml',
    githubRepo: 'example/watchtower-helper',
    latestUpstreamVersion: '2.0.0',
    publishedAt: '2025-01-01T12:00:00Z',
    status: 'ahead',
    checkIssue: null,
    releaseUrl: 'https://github.com/example/watchtower-helper/releases/tag/2.0.0',
    releaseNotes: 'The local image tag is newer than the latest published upstream release.',
    releaseName: 'v2.0.0',
    lastChecked: '2025-03-01T12:00:00Z',
  }),
];

function toSummary(detail: ContainerDetail): ContainerSummary {
  const summary: Partial<ContainerDetail> = { ...detail };
  delete summary.historyComplete;
  delete summary.releaseName;
  delete summary.releaseNotes;
  delete summary.breakingChanges;
  return summary as ContainerSummary;
}

export const mockContainers: ContainerSummary[] = mockContainerDetails.map(toSummary);
