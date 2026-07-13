import type { ContainerDetail, ContainersMeta, ContainerSummary, RefreshMeta } from '../types';

export const idleRefresh: RefreshMeta = {
  state: 'idle',
  scope: null,
  containerId: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};

export function summary(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr:4.0.0',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    iconUrl: '/icons/sonarr.png',
    latestUpstreamVersion: '4.1.0',
    publishedAt: '2026-07-13T12:00:00.000Z',
    status: 'update-available',
    dataState: 'fresh',
    updateKind: 'minor',
    comparisonMode: 'exact',
    checkIssue: null,
    breakingChangeCount: 0,
    releaseUrl: 'https://github.com/linuxserver/sonarr/releases/tag/4.1.0',
    lastChecked: '2026-07-13T12:00:00.000Z',
    ...overrides,
  };
}

export function detail(overrides: Partial<ContainerDetail> = {}): ContainerDetail {
  return {
    ...summary(),
    historyComplete: true,
    releaseName: 'Sonarr 4.1.0',
    releaseNotes: '## Improvements',
    breakingChanges: [],
    ...overrides,
  };
}

export function meta(overrides: Partial<ContainersMeta> = {}): ContainersMeta {
  return {
    refresh: idleRefresh,
    refreshedAt: '2026-07-13T12:00:00.000Z',
    githubRateLimit: null,
    ...overrides,
  };
}
