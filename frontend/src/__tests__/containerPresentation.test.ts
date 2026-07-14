import { describe, expect, it } from 'vitest';
import { getContainerStatusPresentation, getUpstreamVersionLabel } from '../containerPresentation';
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
