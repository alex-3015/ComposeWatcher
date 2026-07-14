import { describe, expect, it } from 'vitest';
import {
  getContainerAttentionCategory,
  getContainerStatusPresentation,
  getRepositoryActionLabel,
  getUpstreamVersionLabel,
} from '../containerPresentation';
import { summary } from './factories';

describe('container presentation', () => {
  it('explains unresolved variables, rolling tags, and digest pins', () => {
    const unverifiable = {
      status: 'unknown' as const,
      comparisonMode: 'unverifiable' as const,
      latestUpstreamVersion: null,
    };

    expect(
      getContainerStatusPresentation(
        summary({ ...unverifiable, currentVersion: '${VERSION:-latest}' }),
      ),
    ).toMatchObject({ label: 'Not comparable', description: expect.stringContaining('variable') });
    expect(
      getContainerStatusPresentation(summary({ ...unverifiable, currentVersion: 'release' })),
    ).toMatchObject({ label: 'Not comparable', description: expect.stringContaining('rolling') });
    expect(
      getContainerStatusPresentation(summary({ ...unverifiable, currentVersion: 'sha256:abcdef' })),
    ).toMatchObject({ label: 'Not comparable', description: expect.stringContaining('Digest') });
  });

  it('distinguishes repository, pending, error, and stale states', () => {
    expect(
      getContainerStatusPresentation(
        summary({ status: 'no-repo', dataState: 'unlinked', githubRepo: null }),
      ).label,
    ).toBe('Repository needed');
    expect(
      getContainerStatusPresentation(
        summary({ status: 'unknown', dataState: 'pending', latestUpstreamVersion: null }),
      ).label,
    ).toBe('Checking…');
    expect(
      getContainerStatusPresentation(
        summary({
          status: 'unknown',
          dataState: 'error',
          checkIssue: { code: 'network', message: 'GitHub is unavailable.', retryAt: null },
        }),
      ),
    ).toMatchObject({ label: 'Check failed', description: 'GitHub is unavailable.' });
    expect(
      getContainerStatusPresentation(summary({ status: 'update-available', dataState: 'stale' }))
        .description,
    ).toContain('cached');
  });

  it('turns breaking counts into calibrated hint labels', () => {
    expect(
      getContainerStatusPresentation(summary({ status: 'breaking-change', breakingChangeCount: 2 }))
        .label,
    ).toBe('2 breaking hints');
  });

  it.each([
    [summary({ status: 'no-repo', dataState: 'unlinked', githubRepo: null }), 'repository-missing'],
    [
      summary({
        status: 'unknown',
        dataState: 'error',
        checkIssue: { code: 'repo-not-found', message: 'Missing', retryAt: null },
      }),
      'check-failed',
    ],
    [summary({ status: 'up-to-date', dataState: 'stale' }), 'check-failed'],
    [
      summary({
        status: 'unknown',
        dataState: 'fresh',
        currentVersion: 'latest',
        comparisonMode: 'unverifiable',
        latestUpstreamVersion: null,
      }),
      'not-comparable',
    ],
    [
      summary({
        status: 'unknown',
        dataState: 'fresh',
        comparisonMode: 'unverifiable',
        latestUpstreamVersion: null,
      }),
      'check-failed',
    ],
    [summary({ status: 'unknown', dataState: 'pending' }), null],
  ] as const)('classifies the attention category for %#', (container, expected) => {
    expect(getContainerAttentionCategory(container)).toBe(expected);
  });

  it('labels repository actions by the next useful step', () => {
    expect(
      getRepositoryActionLabel(
        summary({ status: 'no-repo', dataState: 'unlinked', githubRepo: null }),
      ),
    ).toBe('Link repository');
    expect(
      getRepositoryActionLabel(
        summary({
          dataState: 'error',
          checkIssue: { code: 'repo-not-found', message: 'Missing', retryAt: null },
        }),
      ),
    ).toBe('Fix repository');
    expect(getRepositoryActionLabel(summary())).toBe('Edit repository');
  });

  it('uses actionable upstream placeholders instead of a dash', () => {
    expect(
      getUpstreamVersionLabel(
        summary({
          status: 'no-repo',
          dataState: 'unlinked',
          githubRepo: null,
          latestUpstreamVersion: null,
        }),
      ),
    ).toBe('Repository required');
    expect(
      getUpstreamVersionLabel(
        summary({
          status: 'unknown',
          comparisonMode: 'unverifiable',
          currentVersion: 'latest',
          latestUpstreamVersion: null,
        }),
      ),
    ).toBe('Not comparable');
  });
});
