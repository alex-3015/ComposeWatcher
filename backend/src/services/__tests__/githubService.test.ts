import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerInfo, GithubRelease } from '../../types.js';
import type { GithubCacheData } from '../githubCacheService.js';

const cacheState = vi.hoisted(() => ({ current: null as GithubCacheData | null }));
const saveGithubCacheMock = vi.hoisted(() => vi.fn());

vi.mock('../githubCacheService.js', () => ({
  loadGithubCache: () => cacheState.current,
  saveGithubCache: saveGithubCacheMock,
}));

import { enrichWithGithubData } from '../githubService.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function emptyCache(): GithubCacheData {
  return { schemaVersion: 1, repositories: {}, rateLimit: null };
}

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestUpstreamVersion: null,
    publishedAt: null,
    status: 'unknown',
    updateKind: null,
    comparisonMode: 'unverifiable',
    historyComplete: null,
    releaseDataStale: false,
    checkIssue: null,
    breakingChanges: [],
    releaseUrl: null,
    releaseNotes: null,
    releaseName: null,
    lastChecked: null,
    ...overrides,
  };
}

function makeRelease(overrides: Partial<GithubRelease> = {}): GithubRelease {
  return {
    tag_name: '4.0.0',
    name: 'Release 4.0.0',
    body: 'Bug fixes and improvements.',
    html_url: 'https://github.com/linuxserver/sonarr/releases/tag/4.0.0',
    published_at: '2026-07-13T12:00:00.000Z',
    prerelease: false,
    draft: false,
    ...overrides,
  };
}

function headers(values: Record<string, string> = {}): Headers {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => normalized[name.toLowerCase()] ?? null } as Headers;
}

function response(body: unknown, status = 200, responseHeaders: Headers = headers()) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders,
    json: () => Promise.resolve(body),
  };
}

function mockReleases(...releases: GithubRelease[]): void {
  fetchMock.mockResolvedValueOnce(response(releases, 200, headers({ etag: '"release-etag"' })));
}

async function enrich(container = makeContainer()): Promise<ContainerInfo> {
  const result = await enrichWithGithubData([container]);
  return result.containers[0];
}

beforeEach(() => {
  cacheState.current = emptyCache();
  fetchMock.mockReset();
  saveGithubCacheMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_CONCURRENCY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_CONCURRENCY;
});

describe('GitHub release comparison', () => {
  it('marks containers without a repository without requesting GitHub', async () => {
    const result = await enrich(makeContainer({ githubRepo: null }));

    expect(result).toMatchObject({ status: 'no-repo', checkIssue: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['4.0.0', '4.0.0'],
    ['4.0.0', 'v4.0.0'],
    ['v4.0.0', '4.0.0'],
  ])('reports %s against %s as exactly up-to-date', async (currentVersion, releaseVersion) => {
    mockReleases(makeRelease({ tag_name: releaseVersion }));

    const result = await enrich(makeContainer({ currentVersion }));

    expect(result).toMatchObject({ status: 'up-to-date', comparisonMode: 'exact' });
  });

  it.each([
    ['4.0.0', '4.0.1', 'patch'],
    ['4.0.0', '4.2.0', 'minor'],
    ['4.0.0', '5.0.0', 'major'],
  ] as const)('classifies %s → %s as a %s update', async (currentVersion, releaseVersion, kind) => {
    mockReleases(makeRelease({ tag_name: releaseVersion }));

    const result = await enrich(makeContainer({ currentVersion }));

    expect(result.updateKind).toBe(kind);
    expect(result.status).toBe(kind === 'major' ? 'breaking-change' : 'update-available');
    expect(result.latestUpstreamVersion).toBe(releaseVersion);
  });

  it('reports an image tag newer than upstream as ahead', async () => {
    mockReleases(makeRelease({ tag_name: '4.2.0' }));

    const result = await enrich(makeContainer({ currentVersion: '4.3.0' }));

    expect(result).toMatchObject({ status: 'ahead', updateKind: null });
  });

  it.each(['4.0.0-ls40', '4.0.0-alpine', '4.0.0-r1'])(
    'normalizes packaging suffix %s without changing the stable channel',
    async (currentVersion) => {
      mockReleases(makeRelease({ tag_name: '4.1.0' }));

      const result = await enrich(makeContainer({ currentVersion }));

      expect(result).toMatchObject({
        status: 'update-available',
        comparisonMode: 'normalized',
        updateKind: 'minor',
      });
    },
  );

  it('compares four-component manufacturer versions deterministically', async () => {
    mockReleases(makeRelease({ tag_name: '4.0.15.2944' }));

    const result = await enrich(makeContainer({ currentVersion: '4.0.15.2941-ls40' }));

    expect(result).toMatchObject({
      status: 'update-available',
      updateKind: 'patch',
      comparisonMode: 'normalized',
    });
  });

  it('keeps stable and prerelease channels separate', async () => {
    mockReleases(
      makeRelease({ tag_name: '5.0.0', prerelease: false }),
      makeRelease({ tag_name: '6.0.0-beta.2', prerelease: true }),
      makeRelease({ tag_name: '6.0.0-rc.1', prerelease: true }),
    );

    const prerelease = await enrich(makeContainer({ currentVersion: '6.0.0-beta.1' }));

    expect(prerelease).toMatchObject({
      latestUpstreamVersion: '6.0.0-rc.1',
      updateKind: 'prerelease',
      status: 'update-available',
    });
  });

  it.each(['latest', 'sha256:abcdef', '${IMAGE_TAG:-latest}', '', 'edge'])(
    'marks %j as unverifiable',
    async (currentVersion) => {
      mockReleases(makeRelease({ tag_name: '4.1.0' }));

      const result = await enrich(makeContainer({ currentVersion }));

      expect(result).toMatchObject({
        status: 'unknown',
        comparisonMode: 'unverifiable',
        checkIssue: { code: 'unverifiable-version' },
      });
    },
  );

  it('finds breaking signals in intermediate releases', async () => {
    mockReleases(
      makeRelease({ tag_name: '4.3.0', body: 'Newest fixes.' }),
      makeRelease({ tag_name: '4.2.0', body: 'Migration required before upgrading.' }),
      makeRelease({ tag_name: '4.1.0', body: 'Regular changes.' }),
    );

    const result = await enrich(makeContainer({ currentVersion: '4.0.0' }));

    expect(result.status).toBe('breaking-change');
    expect(result.breakingChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          version: '4.2.0',
          reason: expect.stringContaining('migration required'),
        }),
      ]),
    );
  });

  it('ignores broad wording and fenced examples that are not explicit warnings', async () => {
    mockReleases(
      makeRelease({
        tag_name: '4.1.0',
        body: 'Improves compatibility. No breaking changes. No migration is required.\n```\nBreaking change example\n```',
      }),
    );

    const result = await enrich(makeContainer());

    expect(result.status).toBe('update-available');
    expect(result.breakingChanges).toEqual([]);
  });

  it('marks history incomplete when 100 returned releases do not reach the current version', async () => {
    const releases = Array.from({ length: 100 }, (_, index) =>
      makeRelease({ tag_name: `4.${200 - index}.0`, body: null }),
    );
    mockReleases(...releases);

    const result = await enrich(makeContainer({ currentVersion: '4.0.0' }));

    expect(result.historyComplete).toBe(false);
  });

  it('ignores drafts and unparseable release tags', async () => {
    mockReleases(
      makeRelease({ tag_name: '9.0.0', draft: true }),
      makeRelease({ tag_name: 'edge' }),
      makeRelease({ tag_name: '4.1.0' }),
    );

    const result = await enrich(makeContainer());

    expect(result.latestUpstreamVersion).toBe('4.1.0');
  });
});

describe('GitHub request caching and diagnostics', () => {
  it('uses the releases endpoint, a token, and records rate-limit metadata', async () => {
    process.env.GITHUB_TOKEN = 'secret-token';
    fetchMock.mockResolvedValueOnce(
      response(
        [makeRelease()],
        200,
        headers({
          etag: '"abc"',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1800000000',
        }),
      ),
    );

    const result = await enrichWithGithubData([makeContainer()]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/linuxserver/sonarr/releases?per_page=100',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      }),
    );
    expect(result.githubRateLimit).toMatchObject({ limit: 5000, remaining: 4999 });
  });

  it('revalidates cached releases with ETag and accepts 304', async () => {
    mockReleases(makeRelease({ tag_name: '4.1.0' }));
    await enrich();
    fetchMock.mockResolvedValueOnce(response(null, 304));

    const second = await enrich();

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"release-etag"' }),
      }),
    );
    expect(second).toMatchObject({ status: 'update-available', releaseDataStale: false });
  });

  it('uses stale cached releases after a network failure', async () => {
    mockReleases(makeRelease({ tag_name: '4.1.0' }));
    const first = await enrich();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));

    const second = await enrich();

    expect(second).toMatchObject({
      status: 'update-available',
      releaseDataStale: true,
      checkIssue: { code: 'network' },
      lastChecked: first.lastChecked,
    });
  });

  it('does not retry before a rate-limit reset', async () => {
    fetchMock.mockResolvedValueOnce(
      response({}, 429, headers({ 'x-ratelimit-reset': '4102444800' })),
    );
    const first = await enrich();
    const second = await enrich();

    expect(first.checkIssue?.code).toBe('rate-limited');
    expect(second.checkIssue?.code).toBe('rate-limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, 'repo-not-found'],
    [500, 'github-error'],
  ] as const)('maps HTTP %s to %s without a stale fallback', async (status, code) => {
    fetchMock.mockResolvedValueOnce(response({}, status));

    const result = await enrich();

    expect(result).toMatchObject({ status: 'unknown', checkIssue: { code } });
  });

  it('deduplicates repositories while preserving container order', async () => {
    mockReleases(makeRelease({ tag_name: '4.1.0' }));
    const result = await enrichWithGithubData([
      makeContainer({ id: 'a::one', name: 'one' }),
      makeContainer({ id: 'b::two', name: 'two' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.containers.map((container) => container.name)).toEqual(['one', 'two']);
  });

  it('uses no more than the configured number of concurrent requests', async () => {
    process.env.GITHUB_CONCURRENCY = '2';
    let active = 0;
    let maximum = 0;
    fetchMock.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response([makeRelease()]);
    });
    const containers = Array.from({ length: 6 }, (_, index) =>
      makeContainer({ id: `${index}::app`, githubRepo: `owner/repo-${index}` }),
    );

    await enrichWithGithubData(containers);

    expect(maximum).toBe(2);
  });
});
