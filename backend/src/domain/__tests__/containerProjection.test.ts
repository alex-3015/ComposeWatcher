import { describe, expect, it } from 'vitest';
import type { ContainerInfo } from '../../types.js';
import { toContainerDetail, toContainerSummary } from '../containerProjection.js';

function container(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'compose.yml::app',
    name: 'app',
    image: 'owner/app:1.0.0',
    currentVersion: '1.0.0',
    composeFile: 'compose.yml',
    githubRepo: 'owner/app',
    latestUpstreamVersion: '2.0.0',
    publishedAt: null,
    status: 'update-available',
    updateKind: 'major',
    comparisonMode: 'exact',
    historyComplete: true,
    releaseDataStale: false,
    checkIssue: null,
    breakingChanges: [],
    releaseUrl: null,
    releaseNotes: 'large notes',
    releaseName: '2.0.0',
    lastChecked: null,
    ...overrides,
  };
}

describe('container projections', () => {
  it.each([
    [{ githubRepo: null }, 'unlinked'],
    [{}, 'pending'],
    [{ releaseDataStale: true }, 'stale'],
    [{ checkIssue: { code: 'network', message: 'Offline', retryAt: null } }, 'error'],
    [{ checkIssue: { code: 'unverifiable-version', message: 'Tag', retryAt: null } }, 'fresh'],
  ] as const)('derives public data state %#', (overrides, expected) => {
    expect(toContainerDetail(container(overrides), expected === 'pending').dataState).toBe(
      expected,
    );
  });

  it('excludes every large detail field from summaries', () => {
    const source = container({
      breakingChanges: [
        {
          version: '2.0.0',
          releaseName: 'v2',
          reason: 'Major',
          releaseUrl: 'https://example.test/v2',
        },
      ],
    });
    const detail = toContainerDetail(source);
    const summary = toContainerSummary(source);
    expect(detail).toMatchObject({ releaseNotes: 'large notes', breakingChangeCount: 1 });
    expect(summary).not.toHaveProperty('releaseNotes');
    expect(summary).not.toHaveProperty('releaseName');
    expect(summary).not.toHaveProperty('breakingChanges');
    expect(summary).not.toHaveProperty('historyComplete');
  });

  it('keeps never-checked linked containers pending before refresh work is visible', () => {
    expect(toContainerSummary(container()).dataState).toBe('pending');
  });
});
