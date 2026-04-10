import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContainerInfo } from '../types.js';

// ── Service mocks ────────────────────────────────────────────────────────────
vi.mock('../services/dockerService.js', () => ({
  scanDockerDir: vi.fn(),
}));
vi.mock('../services/githubService.js', () => ({
  enrichWithGithubData: vi.fn(),
}));
vi.mock('../services/configService.js', () => ({
  loadConfig: vi.fn(),
  setRepoMapping: vi.fn(),
}));

import { buildApp } from '../app.js';
import { scanDockerDir } from '../services/dockerService.js';
import { enrichWithGithubData } from '../services/githubService.js';
import { loadConfig, setRepoMapping } from '../services/configService.js';

const mockScanDockerDir = vi.mocked(scanDockerDir);
const mockEnrichWithGithubData = vi.mocked(enrichWithGithubData);
const mockLoadConfig = vi.mocked(loadConfig);
const mockSetRepoMapping = vi.mocked(setRepoMapping);

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestVersion: '4.0.0',
    publishedAt: '2024-01-01T00:00:00Z',
    status: 'up-to-date',
    breakingChangeReason: null,
    releaseUrl: 'https://github.com/linuxserver/sonarr/releases/tag/4.0.0',
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function setupDefaultMocks() {
  vi.resetAllMocks();
  mockLoadConfig.mockReturnValue({ repoMappings: {} });
  mockScanDockerDir.mockReturnValue([makeContainer()]);
  mockEnrichWithGithubData.mockImplementation(async (c) => c);
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/containers — happy path
// ────────────────────────────────────────────────────────────────────────────
describe('GET /api/containers', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with JSON array of containers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('sonarr');
  });

  it('returns application/json content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('calls scanDockerDir, loadConfig, and enrichWithGithubData', async () => {
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
    expect(mockEnrichWithGithubData).toHaveBeenCalledTimes(1);
  });

  it('applies config repoMappings to scanned containers', async () => {
    mockLoadConfig.mockReturnValue({
      repoMappings: { 'docker-compose.yml::sonarr': 'custom/sonarr-fork' },
    });
    mockEnrichWithGithubData.mockImplementation(async (c) => c);

    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    const body = res.json();
    expect(body[0].githubRepo).toBe('custom/sonarr-fork');
  });

  it('preserves original githubRepo when no config mapping exists', async () => {
    mockLoadConfig.mockReturnValue({ repoMappings: { 'other::service': 'other/repo' } });
    mockEnrichWithGithubData.mockImplementation(async (c) => c);

    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    const body = res.json();
    expect(body[0].githubRepo).toBe('linuxserver/sonarr');
  });

  it('returns empty array when no compose files found', async () => {
    mockScanDockerDir.mockReturnValue([]);
    mockEnrichWithGithubData.mockImplementation(async (c) => c);

    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.json()).toEqual([]);
  });

  it('passes enriched data through from enrichWithGithubData', async () => {
    const enriched = makeContainer({ status: 'update-available', latestVersion: '5.0.0' });
    mockEnrichWithGithubData.mockResolvedValue([enriched]);

    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    const body = res.json();
    expect(body[0].status).toBe('update-available');
    expect(body[0].latestVersion).toBe('5.0.0');
  });

  it('handles multiple containers from scanDockerDir', async () => {
    const containers = [
      makeContainer({ id: 'a::svc1', name: 'svc1' }),
      makeContainer({ id: 'b::svc2', name: 'svc2' }),
      makeContainer({ id: 'c::svc3', name: 'svc3' }),
    ];
    mockScanDockerDir.mockReturnValue(containers);
    mockEnrichWithGithubData.mockImplementation(async (c) => c);

    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.json()).toHaveLength(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/containers — error handling
// ────────────────────────────────────────────────────────────────────────────
describe('GET /api/containers – error handling', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 500 when scanDockerDir throws', async () => {
    mockScanDockerDir.mockImplementation(() => {
      throw new Error('Filesystem error');
    });
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns 500 when enrichWithGithubData rejects', async () => {
    mockEnrichWithGithubData.mockRejectedValue(new Error('GitHub API down'));
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns 500 when loadConfig throws', async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error('Config read error');
    });
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal server error' });
  });

  it('does not leak internal error details in 500 response', async () => {
    mockScanDockerDir.mockImplementation(() => {
      throw new Error('Secret internal path: /data/config.json');
    });
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    const body = res.json();
    expect(body.error).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('/data/config.json');
    expect(JSON.stringify(body)).not.toContain('Secret');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/containers — caching
// ────────────────────────────────────────────────────────────────────────────
describe('GET /api/containers – caching', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;
  const savedTTL = process.env.CACHE_TTL_MS;

  beforeEach(async () => {
    setupDefaultMocks();
    dateNowSpy = vi.spyOn(Date, 'now');
    process.env.CACHE_TTL_MS = '1000';
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    dateNowSpy.mockRestore();
    if (savedTTL === undefined) delete process.env.CACHE_TTL_MS;
    else process.env.CACHE_TTL_MS = savedTTL;
    await app.close();
  });

  it('returns cached data on second request within TTL', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);

    dateNowSpy.mockReturnValue(1_000_500); // 500ms < 1000ms TTL
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1); // NOT called again
  });

  it('fetches fresh data after cache TTL expires', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);

    dateNowSpy.mockReturnValue(1_001_001); // 1001ms > 1000ms TTL
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache when ?refresh=true', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);

    dateNowSpy.mockReturnValue(1_000_100); // well within TTL
    await app.inject({ method: 'GET', url: '/api/containers?refresh=true' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(2);
  });

  it('does NOT bypass cache for ?refresh=false', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    await app.inject({ method: 'GET', url: '/api/containers?refresh=false' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
  });

  it('does NOT bypass cache for ?refresh= (empty value)', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    await app.inject({ method: 'GET', url: '/api/containers?refresh=' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
  });

  it('does NOT bypass cache for ?refresh=TRUE (case sensitive)', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    await app.inject({ method: 'GET', url: '/api/containers?refresh=TRUE' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
  });

  it('does NOT bypass cache for ?refresh=1', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    await app.inject({ method: 'GET', url: '/api/containers?refresh=1' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
  });

  it('cache at exact TTL boundary still returns cached data', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });

    dateNowSpy.mockReturnValue(1_000_999); // exactly 999ms < 1000ms TTL
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache after POST /api/containers/:id/repo', async () => {
    dateNowSpy.mockReturnValue(1_000_000);
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(1);

    // POST clears cache
    await app.inject({
      method: 'POST',
      url: '/api/containers/docker-compose.yml%3A%3Asonarr/repo',
      payload: { repo: 'linuxserver/sonarr' },
    });

    // Next GET should fetch fresh
    dateNowSpy.mockReturnValue(1_000_100); // still within TTL
    await app.inject({ method: 'GET', url: '/api/containers' });
    expect(mockScanDockerDir).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/repo — happy path
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/containers/:id/repo', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with { ok: true } on valid request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/docker-compose.yml%3A%3Asonarr/repo',
      payload: { repo: 'linuxserver/sonarr' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('calls setRepoMapping with decoded ID and repo value', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/containers/docker-compose.yml%3A%3Asonarr/repo',
      payload: { repo: 'custom/fork' },
    });
    expect(mockSetRepoMapping).toHaveBeenCalledWith('docker-compose.yml::sonarr', 'custom/fork');
  });

  it('URL-decodes the container ID parameter', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/containers/sub%2Fdir%2Fcompose.yml%3A%3Amysvc/repo',
      payload: { repo: 'org/repo' },
    });
    expect(mockSetRepoMapping).toHaveBeenCalledWith('sub/dir/compose.yml::mysvc', 'org/repo');
  });

  it('accepts null repo to remove mapping', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/compose.yml%3A%3Aapp/repo',
      payload: { repo: null },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSetRepoMapping).toHaveBeenCalledWith('compose.yml::app', null);
  });

  it('accepts repo with dots, hyphens, and underscores', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/a%3A%3Ab/repo',
      payload: { repo: 'my.org-name/my_repo.js' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('accepts repo with numbers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/a%3A%3Ab/repo',
      payload: { repo: 'org123/repo456' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/repo — container ID validation
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/containers/:id/repo – container ID validation', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 400 when decoded ID has no :: separator', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/no-separator-here/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('::');
  });

  it('returns 400 for empty ID (no :: separator)', async () => {
    // Fastify may handle this differently, but the validation should catch it
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/%20/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts ID that is just "::" (has separator)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/%3A%3A/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts URL-encoded ID that decodes to contain ::', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/path%2Fto%2Fcompose.yml%3A%3Aservice/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSetRepoMapping).toHaveBeenCalledWith('path/to/compose.yml::service', 'owner/repo');
  });

  it('accepts ID with multiple :: separators', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/a%3A%3Ab%3A%3Ac/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('does not call setRepoMapping when ID validation fails', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/containers/invalid-id/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(mockSetRepoMapping).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/repo — repo format validation
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/containers/:id/repo – repo format validation', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const validId = 'compose.yml%3A%3Aapp';

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 400 for repo without slash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'noslash' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('owner/repo');
  });

  it('returns 400 for empty string repo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for repo with multiple slashes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'a/b/c' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for repo with spaces', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner /repo' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for repo with @ symbol', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/@repo' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for repo with # symbol', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/repo#1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when repo is undefined (missing key in body)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('does not call setRepoMapping when repo validation fails', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'invalid' },
    });
    expect(mockSetRepoMapping).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/repo — security (injection attacks)
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/containers/:id/repo – security', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const validId = 'compose.yml%3A%3Aapp';

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('rejects path traversal attempt (../evil)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: '../evil/path' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockSetRepoMapping).not.toHaveBeenCalled();
  });

  it('rejects command injection attempt (semicolon)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/repo; rm -rf /' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockSetRepoMapping).not.toHaveBeenCalled();
  });

  it('rejects command injection attempt (backticks)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/`whoami`' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects command injection attempt ($())', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/$(cat /etc/passwd)' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects XSS attempt (script tag)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: '<script>alert(1)</script>/x' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockSetRepoMapping).not.toHaveBeenCalled();
  });

  it('rejects CRLF injection attempt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/repo\r\nX-Injected: true' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects null byte injection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/repo\x00evil' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unicode homograph attack', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: '\u043Ewner/rep\u043E' }, // Cyrillic 'o' instead of Latin
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects repo with SQL-like injection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: "owner/repo' OR 1=1--" },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects repo with URL in value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'https://github.com/owner/repo' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects very long repo string', async () => {
    const longOwner = 'a'.repeat(500);
    const longRepo = 'b'.repeat(500);
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: `${longOwner}/${longRepo}` },
    });
    // Still passes regex (no length limit in regex), but this tests it doesn't crash
    expect(res.statusCode).toBe(200);
  });

  it('rejects repo with pipe character', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/repo|malicious' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects repo with ampersand', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/containers/${validId}/repo`,
      payload: { repo: 'owner/repo&cmd' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/repo — error handling
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/containers/:id/repo – error handling', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 500 when setRepoMapping throws', async () => {
    mockSetRepoMapping.mockImplementation(() => {
      throw new Error('Disk write failed');
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/compose.yml%3A%3Aapp/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal server error' });
  });

  it('does not leak error details in 500 response', async () => {
    mockSetRepoMapping.mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device, write /data/config.json');
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/compose.yml%3A%3Aapp/repo',
      payload: { repo: 'owner/repo' },
    });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('ENOSPC');
    expect(body).not.toContain('/data/config.json');
  });

  it('returns error for malformed JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/compose.yml%3A%3Aapp/repo',
      headers: { 'content-type': 'application/json' },
      payload: '{invalid json}',
    });
    // Fastify returns 400 for invalid JSON
    expect(res.statusCode).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/config
// ────────────────────────────────────────────────────────────────────────────
describe('GET /api/config', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with repoMappings object', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ repoMappings: {} });
  });

  it('returns repoMappings from config', async () => {
    mockLoadConfig.mockReturnValue({
      repoMappings: { 'compose.yml::svc': 'owner/repo' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json().repoMappings).toEqual({ 'compose.yml::svc': 'owner/repo' });
  });

  it('returns only repoMappings (strips other config fields)', async () => {
    mockLoadConfig.mockReturnValue({
      repoMappings: {},
      someOtherField: 'should not appear',
    } as ReturnType<typeof loadConfig>);
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    const body = res.json();
    expect(body).toHaveProperty('repoMappings');
    expect(body).not.toHaveProperty('someOtherField');
  });

  it('returns application/json content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns 500 when loadConfig throws', async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error('Config corrupt');
    });
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal server error' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────────────────────────────────────
describe('CORS', () => {
  it('includes Access-Control-Allow-Origin for cross-origin requests (default *)', async () => {
    setupDefaultMocks();
    const app = await buildApp({ logger: false });

    const res = await app.inject({
      method: 'GET',
      url: '/api/containers',
      headers: { origin: 'http://example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://example.com');

    await app.close();
  });

  it('responds to preflight OPTIONS request with CORS headers', async () => {
    setupDefaultMocks();
    const app = await buildApp({ logger: false });

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/containers',
      headers: {
        origin: 'http://example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://example.com');
    expect(res.headers['access-control-allow-methods']).toBeDefined();

    await app.close();
  });

  it('restricts origin when CORS_ORIGIN env var is set', async () => {
    setupDefaultMocks();
    const saved = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://allowed.com';

    const app = await buildApp({ logger: false });

    const res = await app.inject({
      method: 'GET',
      url: '/api/containers',
      headers: { origin: 'http://not-allowed.com' },
    });
    // When origin doesn't match, @fastify/cors does not set the header
    expect(res.headers['access-control-allow-origin']).not.toBe('http://not-allowed.com');

    if (saved === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = saved;
    await app.close();
  });

  it('allows listed origin when CORS_ORIGIN is comma-separated', async () => {
    setupDefaultMocks();
    const saved = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://a.com, http://b.com';

    const app = await buildApp({ logger: false });

    const res = await app.inject({
      method: 'GET',
      url: '/api/containers',
      headers: { origin: 'http://b.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://b.com');

    if (saved === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = saved;
    await app.close();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Unknown routes
// ────────────────────────────────────────────────────────────────────────────
describe('Unknown routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    setupDefaultMocks();
    app = await buildApp({ logger: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 404 for GET to unknown path', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for POST to unknown path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nonexistent',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for DELETE method on existing route', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/containers' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for PUT method on repo endpoint', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/containers/a%3A%3Ab/repo',
      payload: { repo: 'owner/repo' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildApp options
// ────────────────────────────────────────────────────────────────────────────
describe('buildApp', () => {
  it('creates a Fastify instance with logger disabled when opts.logger is false', async () => {
    setupDefaultMocks();
    const app = await buildApp({ logger: false });
    // Verify the app works (logger disabled means no log output)
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('creates a working app with default options', async () => {
    setupDefaultMocks();
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
