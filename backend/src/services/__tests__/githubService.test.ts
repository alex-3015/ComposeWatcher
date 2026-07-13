import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerInfo, GithubRelease } from '../../types.js';
import { enrichWithGithubData } from '../githubService.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestVersion: null,
    publishedAt: null,
    status: 'unknown',
    checkIssue: null,
    breakingChangeReason: null,
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
  return { get: (name: string) => values[name.toLowerCase()] ?? null } as Headers;
}

function response(release: unknown, status = 200, responseHeaders: Headers = headers()) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders,
    json: () => Promise.resolve(release),
  };
}

function mockRelease(release: GithubRelease): void {
  fetchMock.mockResolvedValueOnce(response(release));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_CONCURRENCY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_CONCURRENCY;
});

describe('GitHub enrichment', () => {
  it('marks containers without a repository and performs no request', async () => {
    const [result] = await enrichWithGithubData([makeContainer({ githubRepo: null })]);

    expect(result).toMatchObject({ status: 'no-repo', checkIssue: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['4.0.0', '4.0.0'],
    ['4.0.0', 'v4.0.0'],
    ['v4.0.0', '4.0.0'],
    ['4.1.0', '4.0.0'],
  ])('reports %s against %s as up-to-date', async (currentVersion, latestVersion) => {
    mockRelease(makeRelease({ tag_name: latestVersion }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion })]);

    expect(result.status).toBe('up-to-date');
    expect(result.checkIssue).toBeNull();
  });

  it('reports patch and minor updates', async () => {
    mockRelease(makeRelease({ tag_name: '4.2.1' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);

    expect(result.status).toBe('update-available');
    expect(result.latestVersion).toBe('4.2.1');
  });

  it('detects major updates and breaking keywords', async () => {
    mockRelease(makeRelease({ tag_name: '5.0.0' }));
    mockRelease(makeRelease({ tag_name: '4.1.0', body: 'Migration required before upgrading.' }));

    const [major] = await enrichWithGithubData([makeContainer()]);
    const [keyword] = await enrichWithGithubData([makeContainer()]);

    expect(major.status).toBe('breaking-change');
    expect(major.breakingChangeReason).toContain('Major version bump');
    expect(keyword.status).toBe('breaking-change');
    expect(keyword.breakingChangeReason).toContain('migration required');
  });

  it.each(['latest', 'sha256:abcdef', '${IMAGE_TAG:-latest}', ''])(
    'marks the current tag %j as unverifiable',
    async (currentVersion) => {
      mockRelease(makeRelease({ tag_name: '4.1.0' }));
      const [result] = await enrichWithGithubData([makeContainer({ currentVersion })]);

      expect(result.status).toBe('unknown');
      expect(result.checkIssue?.code).toBe('unverifiable-version');
    },
  );

  it('allows exact non-semver equality but rejects unequal non-semver tags', async () => {
    mockRelease(makeRelease({ tag_name: 'edge' }));
    mockRelease(makeRelease({ tag_name: 'release-new' }));

    const [equal] = await enrichWithGithubData([makeContainer({ currentVersion: 'edge' })]);
    const [different] = await enrichWithGithubData([
      makeContainer({ currentVersion: 'release-old' }),
    ]);

    expect(equal.status).toBe('up-to-date');
    expect(different.status).toBe('unknown');
    expect(different.checkIssue?.code).toBe('unverifiable-version');
  });

  it('copies validated release metadata', async () => {
    mockRelease(
      makeRelease({
        name: null,
        body: null,
        published_at: '2026-01-02T03:04:05.000Z',
      }),
    );
    const [result] = await enrichWithGithubData([makeContainer()]);

    expect(result).toMatchObject({
      publishedAt: '2026-01-02T03:04:05.000Z',
      releaseName: null,
      releaseNotes: null,
    });
    expect(result.releaseUrl).toContain('/releases/tag/');
    expect(result.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it.each([
    [404, 'repo-not-found'],
    [500, 'github-error'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    fetchMock.mockResolvedValueOnce(response({}, status));
    const [result] = await enrichWithGithubData([makeContainer()]);

    expect(result.status).toBe('unknown');
    expect(result.checkIssue?.code).toBe(code);
  });

  it.each([403, 429])('maps HTTP %s to a rate-limit issue with retry time', async (status) => {
    fetchMock.mockResolvedValueOnce(
      response({}, status, headers({ 'x-ratelimit-reset': '1800000000' })),
    );
    const [result] = await enrichWithGithubData([makeContainer()]);

    expect(result.checkIssue).toMatchObject({
      code: 'rate-limited',
      retryAt: new Date(1_800_000_000_000).toISOString(),
    });
  });

  it('classifies timeout, network, and generic request failures', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    fetchMock.mockRejectedValueOnce(new Error('boom'));

    const [timeout] = await enrichWithGithubData([makeContainer()]);
    const [network] = await enrichWithGithubData([makeContainer()]);
    const [generic] = await enrichWithGithubData([makeContainer()]);

    expect(timeout.checkIssue?.code).toBe('timeout');
    expect(network.checkIssue?.code).toBe('network');
    expect(generic.checkIssue).toMatchObject({ code: 'github-error' });
  });

  it('rejects malformed release responses', async () => {
    fetchMock.mockResolvedValueOnce(response({ tag_name: '4.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer()]);

    expect(result.status).toBe('unknown');
    expect(result.checkIssue?.code).toBe('invalid-release');
  });

  it('rejects malformed repository mappings without making a request', async () => {
    const [result] = await enrichWithGithubData([makeContainer({ githubRepo: 'invalid' })]);

    expect(result.checkIssue?.code).toBe('github-error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates repositories while preserving container order', async () => {
    mockRelease(makeRelease({ tag_name: '4.1.0' }));
    const containers = [
      makeContainer({ id: 'a::one', name: 'one' }),
      makeContainer({ id: 'b::two', name: 'two' }),
    ];
    const result = await enrichWithGithubData(containers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.map((container) => container.name)).toEqual(['one', 'two']);
    expect(result.every((container) => container.latestVersion === '4.1.0')).toBe(true);
  });

  it('uses no more than five concurrent requests by default', async () => {
    let active = 0;
    let maximum = 0;
    fetchMock.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response(makeRelease());
    });
    const containers = Array.from({ length: 12 }, (_, index) =>
      makeContainer({ id: `${index}::app`, githubRepo: `owner/repo-${index}` }),
    );

    await enrichWithGithubData(containers);

    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(maximum).toBe(5);
  });

  it('honors a smaller configured concurrency', async () => {
    process.env.GITHUB_CONCURRENCY = '2';
    let active = 0;
    let maximum = 0;
    fetchMock.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response(makeRelease());
    });
    const containers = Array.from({ length: 6 }, (_, index) =>
      makeContainer({ id: `${index}::app`, githubRepo: `owner/repo-${index}` }),
    );

    await enrichWithGithubData(containers);

    expect(maximum).toBe(2);
  });

  it('continues after a partial failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    mockRelease(makeRelease({ tag_name: '2.0.0' }));
    const result = await enrichWithGithubData([
      makeContainer({ id: 'a::app', githubRepo: 'owner/a' }),
      makeContainer({ id: 'b::app', githubRepo: 'owner/b', currentVersion: '2.0.0' }),
    ]);

    expect(result[0].checkIssue?.code).toBe('network');
    expect(result[1].status).toBe('up-to-date');
  });

  it('uses the expected endpoint and optional token', async () => {
    process.env.GITHUB_TOKEN = 'secret-token';
    mockRelease(makeRelease());
    await enrichWithGithubData([makeContainer()]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/linuxserver/sonarr/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      }),
    );
  });
});
