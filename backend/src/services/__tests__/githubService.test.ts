import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContainerInfo, GithubRelease } from '../../types.js';
import { enrichWithGithubData } from '../githubService.js';

// ── fetch mock ────────────────────────────────────────────────────────────────
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    breakingChangeReason: null,
    releaseUrl: null,
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
    published_at: '2024-01-01T00:00:00Z',
    prerelease: false,
    draft: false,
    ...overrides,
  };
}

function mockOkResponse(release: GithubRelease) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(release),
    text: () => Promise.resolve(''),
  });
}

function mock404Response() {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('Not Found'),
  });
}

function mockErrorResponse(status = 500) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('Internal Server Error'),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// No repo
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – no repo', () => {
  it('returns empty array for empty input', async () => {
    const result = await enrichWithGithubData([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets status "no-repo" when githubRepo is null', async () => {
    const c = makeContainer({ githubRepo: null });
    const [result] = await enrichWithGithubData([c]);
    expect(result.status).toBe('no-repo');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Up-to-date
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – up-to-date', () => {
  it('sets status "up-to-date" when semver versions match', async () => {
    mockOkResponse(makeRelease({ tag_name: '4.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('up-to-date');
    expect(result.breakingChangeReason).toBeNull();
  });

  it('handles v-prefixed tags: v4.0.0 vs 4.0.0', async () => {
    mockOkResponse(makeRelease({ tag_name: 'v4.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('up-to-date');
  });

  it('handles both sides v-prefixed: v4.0.0 vs v4.0.0', async () => {
    mockOkResponse(makeRelease({ tag_name: 'v4.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: 'v4.0.0' })]);
    expect(result.status).toBe('up-to-date');
  });

  it('non-semver: same string → up-to-date', async () => {
    mockOkResponse(makeRelease({ tag_name: 'latest' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: 'latest' })]);
    expect(result.status).toBe('up-to-date');
  });

  it('does not set breakingChangeReason when up-to-date (even if body has keywords)', async () => {
    mockOkResponse(makeRelease({ tag_name: '4.0.0', body: 'breaking change in this release' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('up-to-date');
    expect(result.breakingChangeReason).toBeNull();
  });

  it('sets latestVersion, publishedAt, releaseUrl, lastChecked on success', async () => {
    const release = makeRelease({ tag_name: '4.0.0', published_at: '2024-06-01T00:00:00Z' });
    mockOkResponse(release);
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);

    expect(result.latestVersion).toBe('4.0.0');
    expect(result.publishedAt).toBe('2024-06-01T00:00:00Z');
    expect(result.releaseUrl).toBe(release.html_url);
    expect(result.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Update available (no breaking)
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – update-available', () => {
  it('sets status "update-available" for a patch bump', async () => {
    mockOkResponse(makeRelease({ tag_name: '4.0.1' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('update-available');
    expect(result.latestVersion).toBe('4.0.1');
  });

  it('sets status "update-available" for a minor bump', async () => {
    mockOkResponse(makeRelease({ tag_name: '4.1.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('update-available');
  });

  it('non-semver: different string → update-available', async () => {
    mockOkResponse(makeRelease({ tag_name: '2024-06-01' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '2024-01-01' })]);
    expect(result.status).toBe('update-available');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Breaking changes
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – breaking-change (major version)', () => {
  it('detects major version bump 1.x → 2.x', async () => {
    mockOkResponse(makeRelease({ tag_name: '2.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '1.9.9' })]);
    expect(result.status).toBe('breaking-change');
    expect(result.breakingChangeReason).toContain('Major version bump');
    expect(result.breakingChangeReason).toContain('1.9.9');
    expect(result.breakingChangeReason).toContain('2.0.0');
  });

  it('detects major bump with v-prefix', async () => {
    mockOkResponse(makeRelease({ tag_name: 'v3.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: 'v2.5.0' })]);
    expect(result.status).toBe('breaking-change');
    expect(result.breakingChangeReason).toContain('Major version bump');
  });

  it('does NOT flag minor bump as breaking-change via major version', async () => {
    mockOkResponse(makeRelease({ tag_name: '1.1.0', body: '' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '1.0.0' })]);
    expect(result.status).toBe('update-available');
  });
});

describe('enrichWithGithubData – breaking-change (keywords)', () => {
  const keywords = [
    'breaking change',
    'breaking-change',
    'breaking_change',
    'incompatible',
    'migration required',
    'manual intervention',
    'nicht abwärtskompatibel',
  ];

  for (const kw of keywords) {
    it(`detects keyword "${kw}" in release body`, async () => {
      mockOkResponse(makeRelease({ tag_name: '4.1.0', body: `This release has a ${kw} note.` }));
      const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
      expect(result.status).toBe('breaking-change');
      expect(result.breakingChangeReason).toContain(kw);
    });
  }

  it('detects keyword in release name/title (case-insensitive)', async () => {
    mockOkResponse(
      makeRelease({ tag_name: '4.1.0', name: 'Release with Breaking Change', body: '' }),
    );
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('breaking-change');
  });

  it('is case-insensitive for keywords in body', async () => {
    mockOkResponse(makeRelease({ tag_name: '4.1.0', body: 'BREAKING CHANGE detected.' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('breaking-change');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GitHub API error scenarios
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – API errors', () => {
  it('sets status "unknown" when GitHub returns 404', async () => {
    mock404Response();
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(result.lastChecked).toBeTruthy();
  });

  it('sets status "unknown" on non-ok HTTP response (500)', async () => {
    mockErrorResponse(500);
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
  });

  it('sets status "unknown" when fetch throws (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Token / headers
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – GitHub API request', () => {
  it('sends request to correct GitHub API URL', async () => {
    mockOkResponse(makeRelease());
    await enrichWithGithubData([makeContainer({ githubRepo: 'linuxserver/sonarr' })]);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/linuxserver/sonarr/releases/latest');
  });

  it('does not include Authorization header when GITHUB_TOKEN is not set', async () => {
    const saved = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      mockOkResponse(makeRelease());
      await enrichWithGithubData([makeContainer()]);
      const [, options] = fetchMock.mock.calls[0];
      expect((options as RequestInit).headers).not.toHaveProperty('Authorization');
    } finally {
      if (saved !== undefined) process.env.GITHUB_TOKEN = saved;
    }
  });

  it('includes Authorization Bearer header when GITHUB_TOKEN env var is set', async () => {
    const saved = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'ghp_testtoken123';
    try {
      mockOkResponse(makeRelease());
      await enrichWithGithubData([makeContainer()]);
      const [, options] = fetchMock.mock.calls[0];
      expect((options as RequestInit).headers).toHaveProperty(
        'Authorization',
        'Bearer ghp_testtoken123',
      );
    } finally {
      if (saved === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = saved;
      }
    }
  });

  it('does not include Authorization header when GITHUB_TOKEN is empty string', async () => {
    const saved = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = '';
    try {
      mockOkResponse(makeRelease());
      await enrichWithGithubData([makeContainer()]);
      const [, options] = fetchMock.mock.calls[0];
      expect((options as RequestInit).headers).not.toHaveProperty('Authorization');
    } finally {
      if (saved === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = saved;
      }
    }
  });

  it('always sends standard GitHub API headers', async () => {
    mockOkResponse(makeRelease());
    await enrichWithGithubData([makeContainer()]);
    const [, options] = fetchMock.mock.calls[0];
    expect((options as RequestInit).headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('processes multiple containers sequentially', async () => {
    mockOkResponse(makeRelease({ tag_name: '1.0.0' }));
    mockOkResponse(makeRelease({ tag_name: '2.0.0' }));

    const c1 = makeContainer({ id: 'a::app1', githubRepo: 'org/app1', currentVersion: '1.0.0' });
    const c2 = makeContainer({ id: 'b::app2', githubRepo: 'org/app2', currentVersion: '2.0.0' });
    const result = await enrichWithGithubData([c1, c2]);

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('up-to-date');
    expect(result[1].status).toBe('up-to-date');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('continues processing remaining containers after one fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    mockOkResponse(makeRelease({ tag_name: '2.0.0' }));

    const c1 = makeContainer({ id: 'a::app1', githubRepo: 'org/app1' });
    const c2 = makeContainer({ id: 'b::app2', githubRepo: 'org/app2', currentVersion: '2.0.0' });
    const result = await enrichWithGithubData([c1, c2]);

    expect(result[0].status).toBe('unknown');
    expect(result[1].status).toBe('up-to-date');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – prerelease / draft releases', () => {
  it('treats prerelease releases as normal (not filtered out)', async () => {
    mockOkResponse(makeRelease({ tag_name: '5.0.0', prerelease: true }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    // Current behaviour: prerelease is not filtered — still detected as major bump
    expect(result.status).toBe('breaking-change');
  });

  it('treats draft releases as normal (not filtered out)', async () => {
    mockOkResponse(makeRelease({ tag_name: '4.1.0', draft: true }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('update-available');
  });
});

describe('enrichWithGithubData – downgrade scenario', () => {
  it('reports "up-to-date" when current version is already newer than latest', async () => {
    // e.g. user pinned a newer dev build; latest release is behind
    mockOkResponse(makeRelease({ tag_name: '3.9.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('up-to-date');
    expect(result.breakingChangeReason).toBeNull();
  });

  it('non-semver downgrade: different strings → update-available (string fallback)', async () => {
    mockOkResponse(makeRelease({ tag_name: 'release-old' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: 'release-new' })]);
    // Non-semver fallback: strings differ → update-available
    expect(result.status).toBe('update-available');
  });
});

describe('enrichWithGithubData – null/missing release fields', () => {
  it('handles release body being null without crashing', async () => {
    // GitHub API sometimes returns null body for releases with no description
    mockOkResponse(makeRelease({ tag_name: '4.1.0', body: null as unknown as string }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('update-available');
    expect(result.breakingChangeReason).toBeNull();
  });

  it('handles release name being null without crashing', async () => {
    mockOkResponse(
      makeRelease({ tag_name: '4.1.0', name: null as unknown as string, body: 'breaking change' }),
    );
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '4.0.0' })]);
    expect(result.status).toBe('breaking-change');
  });
});

describe('enrichWithGithubData – rate limit (403)', () => {
  it('sets status "unknown" on 403 rate-limit response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('API rate limit exceeded'),
    });
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(result.lastChecked).toBeTruthy();
  });

  it('sets status "unknown" on 429 too-many-requests response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('Too Many Requests'),
    });
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
  });
});

describe('enrichWithGithubData – malformed githubRepo', () => {
  it('handles repo string without slash gracefully (sets unknown via fetch failure)', async () => {
    // 'badrepo' → split gives owner='badrepo', repo=undefined → URL: repos/badrepo/undefined/...
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('Not Found'),
    });
    const [result] = await enrichWithGithubData([makeContainer({ githubRepo: 'badrepo' })]);
    expect(result.status).toBe('unknown');
  });
});

describe('enrichWithGithubData – 0.x major bump', () => {
  it('detects 0.x → 1.0 as a major version bump', async () => {
    mockOkResponse(makeRelease({ tag_name: '1.0.0' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '0.9.9' })]);
    expect(result.status).toBe('breaking-change');
    expect(result.breakingChangeReason).toContain('Major version bump');
  });

  it('does NOT flag 0.9 → 0.10 as breaking-change (minor bump within 0.x)', async () => {
    mockOkResponse(makeRelease({ tag_name: '0.10.0', body: '' }));
    const [result] = await enrichWithGithubData([makeContainer({ currentVersion: '0.9.0' })]);
    expect(result.status).toBe('update-available');
    expect(result.breakingChangeReason).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Timeout / no response / incomplete response
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – timeout / no response', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** fetch that never resolves but aborts cleanly when signal fires */
  function mockHangingFetch() {
    fetchMock.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise<never>((_, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
  }

  /** fetch that resolves OK but whose json() body never arrives */
  function mockHangingJson() {
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<never>((_, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
        text: () => Promise.resolve(''),
      }),
    );
  }

  it('sets status "unknown" when GitHub never responds (fetch hangs)', async () => {
    mockHangingFetch();
    const promise = enrichWithGithubData([makeContainer()]);
    await vi.runAllTimersAsync();
    const [result] = await promise;
    expect(result.status).toBe('unknown');
    expect(result.lastChecked).toBeTruthy();
  });

  it('sets status "unknown" when response body never arrives (incomplete response)', async () => {
    mockHangingJson();
    const promise = enrichWithGithubData([makeContainer()]);
    await vi.runAllTimersAsync();
    const [result] = await promise;
    expect(result.status).toBe('unknown');
    expect(result.lastChecked).toBeTruthy();
  });

  it('sets status "unknown" on 401 (private / inaccessible repository)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('Unauthorized'),
    });
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(result.lastChecked).toBeTruthy();
  });

  it('continues processing remaining containers after one times out', async () => {
    mockHangingFetch();
    mockOkResponse(makeRelease({ tag_name: '2.0.0' }));

    const c1 = makeContainer({ id: 'a::app1', githubRepo: 'org/app1' });
    const c2 = makeContainer({ id: 'b::app2', githubRepo: 'org/app2', currentVersion: '2.0.0' });
    const promise = enrichWithGithubData([c1, c2]);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result[0].status).toBe('unknown');
    expect(result[1].status).toBe('up-to-date');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Error classification in enrichWithGithubData
// ────────────────────────────────────────────────────────────────────────────
describe('enrichWithGithubData – error classification logging', () => {
  it('logs "timeout" for AbortError', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('logs "network error" for TypeError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('network error'));
  });

  it('logs "API error" with message for generic Error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Something went wrong'));
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('API error: Something went wrong'),
    );
  });

  it('logs "API error" with stringified value for non-Error throw', async () => {
    fetchMock.mockRejectedValueOnce('string error');
    const [result] = await enrichWithGithubData([makeContainer()]);
    expect(result.status).toBe('unknown');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('API error: string error'));
  });
});
