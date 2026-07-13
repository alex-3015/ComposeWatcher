import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import type fs from 'fs';

// ── fs mock ────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    promises: {
      readdir: vi.fn(),
      readFile: vi.fn(),
    },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Import AFTER mock declaration so imports receive the mock
import fsDefault from 'fs';
import { inferGithubRepo, scanDockerDir, DEFAULT_IMAGE_MAPPINGS } from '../dockerService.js';

const mockFs = fsDefault as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  readdirSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  promises: {
    readdir: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
  };
};

// Helper to create a fake fs.Dirent
function mockFile(name: string): fs.Dirent {
  return { name, isDirectory: () => false, isFile: () => true } as unknown as fs.Dirent;
}
function mockDir(name: string): fs.Dirent {
  return { name, isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent;
}

const DOCKER_DIR = '/docker';

beforeEach(() => {
  vi.clearAllMocks();
  mockFs.promises.readdir.mockImplementation((...args: unknown[]) => {
    const read = mockFs.readdirSync as unknown as (...values: unknown[]) => unknown;
    return Promise.resolve(read(...args));
  });
  mockFs.promises.readFile.mockImplementation((...args: unknown[]) => {
    const read = mockFs.readFileSync as unknown as (...values: unknown[]) => unknown;
    return Promise.resolve(read(...args));
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ────────────────────────────────────────────────────────────────────────────
// inferGithubRepo
// ────────────────────────────────────────────────────────────────────────────
describe('inferGithubRepo', async () => {
  // Registry stripping + path detection
  it('strips ghcr.io prefix and returns owner/repo', async () => {
    expect(inferGithubRepo('ghcr.io/linuxserver/sonarr')).toBe('linuxserver/sonarr');
  });

  it('strips lscr.io prefix and returns owner/repo', async () => {
    expect(inferGithubRepo('lscr.io/linuxserver/radarr')).toBe('linuxserver/radarr');
  });

  it('strips docker.io prefix and returns generic owner/repo', async () => {
    expect(inferGithubRepo('docker.io/myorg/myapp')).toBe('myorg/myapp');
  });

  it('strips registry.hub.docker.com prefix', async () => {
    expect(inferGithubRepo('registry.hub.docker.com/myorg/myapp')).toBe('myorg/myapp');
  });

  it('returns only first two path segments for deep ghcr.io paths', async () => {
    expect(inferGithubRepo('ghcr.io/owner/repo/extra')).toBe('owner/repo');
  });

  // Known mappings
  it('maps gitea/gitea → go-gitea/gitea', async () => {
    expect(inferGithubRepo('gitea/gitea')).toBe('go-gitea/gitea');
  });

  it('maps portainer/portainer-ce → portainer/portainer', async () => {
    expect(inferGithubRepo('portainer/portainer-ce')).toBe('portainer/portainer');
  });

  it('maps portainer/portainer-ee → portainer/portainer', async () => {
    expect(inferGithubRepo('portainer/portainer-ee')).toBe('portainer/portainer');
  });

  it('maps authelia/authelia → authelia/authelia', async () => {
    expect(inferGithubRepo('authelia/authelia')).toBe('authelia/authelia');
  });

  it('maps single-name traefik → traefik/traefik', async () => {
    expect(inferGithubRepo('traefik')).toBe('traefik/traefik');
  });

  it('maps single-name nginx → nginx/nginx', async () => {
    expect(inferGithubRepo('nginx')).toBe('nginx/nginx');
  });

  it('maps nextcloud → nextcloud/nextcloud', async () => {
    expect(inferGithubRepo('nextcloud')).toBe('nextcloud/nextcloud');
  });

  it('maps vaultwarden/server → dani-garcia/vaultwarden', async () => {
    expect(inferGithubRepo('vaultwarden/server')).toBe('dani-garcia/vaultwarden');
  });

  it('maps adguard/adguardhome → AdguardTeam/AdGuardHome', async () => {
    expect(inferGithubRepo('adguard/adguardhome')).toBe('AdguardTeam/AdGuardHome');
  });

  it('known mapping takes priority over ghcr.io path rule (ghcr.io/gitea/gitea)', async () => {
    expect(inferGithubRepo('ghcr.io/gitea/gitea')).toBe('go-gitea/gitea');
  });

  // Generic 2-segment docker hub images
  it('returns owner/repo for generic 2-segment docker hub image', async () => {
    expect(inferGithubRepo('myorg/myapp')).toBe('myorg/myapp');
  });

  // Null cases
  it('returns null for unknown single-segment image', async () => {
    expect(inferGithubRepo('ubuntu')).toBeNull();
  });

  it('returns null for 2-segment image where first part contains a dot (custom registry)', async () => {
    expect(inferGithubRepo('my.registry/myapp')).toBeNull();
  });

  it('returns null for 3-segment non-ghcr path', async () => {
    expect(inferGithubRepo('customreg.io/owner/repo')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// scanDockerDir
// ────────────────────────────────────────────────────────────────────────────
describe('scanDockerDir', async () => {
  it('returns empty array when DOCKER_DIR does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(await scanDockerDir()).toEqual([]);
  });

  it('returns empty array when directory contains no compose files', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('README.md'), mockFile('.env')]);
    expect(await scanDockerDir()).toEqual([]);
  });

  it('parses a simple docker-compose.yml with one service', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(
      'services:\n  sonarr:\n    image: ghcr.io/linuxserver/sonarr:4.0.0\n',
    );

    const result = await scanDockerDir();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sonarr');
    expect(result[0].image).toBe('ghcr.io/linuxserver/sonarr');
    expect(result[0].currentVersion).toBe('4.0.0');
    expect(result[0].composeFile).toBe('docker-compose.yml');
    expect(result[0].githubRepo).toBe('linuxserver/sonarr');
    expect(result[0].status).toBe('unknown');
    expect(result[0].latestUpstreamVersion).toBeNull();
  });

  it('assigns id as "composeFile::serviceName"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  radarr:\n    image: myimg:1.0\n');

    const [c] = await scanDockerDir();
    expect(c.id).toBe('docker-compose.yml::radarr');
  });

  it('uses "latest" as version when image has no tag', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image: myorg/myapp\n');

    const [c] = await scanDockerDir();
    expect(c.currentVersion).toBe('latest');
    expect(c.image).toBe('myorg/myapp');
  });

  it('parses multiple services from one compose file', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(
      'services:\n  sonarr:\n    image: sonarr:4.0\n  radarr:\n    image: radarr:5.0\n',
    );

    const result = await scanDockerDir();
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(expect.arrayContaining(['sonarr', 'radarr']));
  });

  it('skips services without an image key', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  db:\n    build: .\n');

    expect(await scanDockerDir()).toHaveLength(0);
  });

  it('accepts all four compose file name variants', async () => {
    const names = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    for (const name of names) {
      vi.clearAllMocks();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([mockFile(name)]);
      mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image: myapp:1.0\n');

      const result = await scanDockerDir();
      expect(result).toHaveLength(1);
      expect(result[0].composeFile).toBe(name);
    }
  });

  it('ignores files that are not compose files', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([
      mockFile('docker-compose.yml.bak'),
      mockFile('compose.txt'),
    ]);

    expect(await scanDockerDir()).toHaveLength(0);
  });

  it('recurses into subdirectories', async () => {
    const subDir = path.join(DOCKER_DIR, 'sonarr');
    mockFs.existsSync.mockImplementation((p) => p === DOCKER_DIR || p === subDir);
    mockFs.readdirSync.mockImplementation((p) => {
      if (p === DOCKER_DIR) return [mockDir('sonarr')];
      if (p === subDir) return [mockFile('docker-compose.yml')];
      return [];
    });
    mockFs.readFileSync.mockReturnValue('services:\n  sonarr:\n    image: sonarr:4.0\n');

    const result = await scanDockerDir();
    expect(result).toHaveLength(1);
    expect(result[0].composeFile).toBe(path.join('sonarr', 'docker-compose.yml'));
  });

  it('skips compose files with invalid YAML and continues', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml'), mockFile('compose.yml')]);
    mockFs.readFileSync
      .mockReturnValueOnce(': invalid: yaml: [[[')
      .mockReturnValueOnce('services:\n  app:\n    image: myapp:1.0\n');

    const result = await scanDockerDir();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app');
  });

  it('skips compose files with no services key', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('version: "3"\n');

    expect(await scanDockerDir()).toHaveLength(0);
  });

  it('correctly parses image with port-like colon in registry (no false tag split)', async () => {
    // registry:5000/owner/repo:tag — lastColon is after "tag", not after port
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(
      'services:\n  app:\n    image: registry:5000/owner/repo:v1.2.3\n',
    );

    const [c] = await scanDockerDir();
    expect(c.currentVersion).toBe('v1.2.3');
    expect(c.image).toBe('registry:5000/owner/repo');
  });

  it('skips service where image value is null in YAML', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    // YAML null value for image key
    mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image:\n');
    expect(await scanDockerDir()).toHaveLength(0);
  });

  it('correctly handles registry:port/owner/repo without tag', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image: registry:5000/owner/repo\n');
    const [c] = await scanDockerDir();
    expect(c.image).toBe('registry:5000/owner/repo');
    expect(c.currentVersion).toBe('latest');
  });

  it('recurses correctly into 3-level nested directories', async () => {
    const l1 = path.join(DOCKER_DIR, 'media');
    const l2 = path.join(l1, 'arr');
    mockFs.existsSync.mockImplementation((p) => [DOCKER_DIR, l1, l2].includes(p as string));
    mockFs.readdirSync.mockImplementation((p) => {
      if (p === DOCKER_DIR) return [mockDir('media')];
      if (p === l1) return [mockDir('arr')];
      if (p === l2) return [mockFile('docker-compose.yml')];
      return [];
    });
    mockFs.readFileSync.mockReturnValue('services:\n  sonarr:\n    image: sonarr:4.0\n');

    const result = await scanDockerDir();
    expect(result).toHaveLength(1);
    expect(result[0].composeFile).toBe(path.join('media', 'arr', 'docker-compose.yml'));
  });

  it('returns compose files and services in deterministic order', async () => {
    const alphaDir = path.join(DOCKER_DIR, 'alpha');
    const zuluDir = path.join(DOCKER_DIR, 'zulu');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockImplementation((value) => {
      if (value === DOCKER_DIR) return [mockDir('zulu'), mockDir('alpha')];
      return [mockFile('docker-compose.yml')];
    });
    mockFs.readFileSync.mockImplementation((value) =>
      String(value).includes(alphaDir)
        ? 'services:\n  z-service:\n    image: example/z:1.0\n  a-service:\n    image: example/a:1.0\n'
        : 'services:\n  app:\n    image: example/app:1.0\n',
    );

    const result = await scanDockerDir();

    expect(result.map((container) => container.id)).toEqual([
      path.join('alpha', 'docker-compose.yml::a-service'),
      path.join('alpha', 'docker-compose.yml::z-service'),
      path.join('zulu', 'docker-compose.yml::app'),
    ]);
    expect(alphaDir).not.toBe(zuluDir);
  });

  it('skips an unreadable subdirectory without discarding readable compose files', async () => {
    const unreadableDir = path.join(DOCKER_DIR, 'private');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockImplementation((value) => {
      if (value === DOCKER_DIR) return [mockFile('compose.yml'), mockDir('private')];
      if (value === unreadableDir) throw new Error('permission denied');
      return [];
    });
    mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image: example/app:1.0\n');

    const result = await scanDockerDir();

    expect(result).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      'Skipping unreadable directory',
      expect.objectContaining({ directory: unreadableDir }),
    );
  });

  it('handles compose file where services value is null', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n');
    expect(await scanDockerDir()).toHaveLength(0);
  });
});

describe('inferGithubRepo – additional edge cases', async () => {
  it('strips digest suffix and returns clean owner/repo for ghcr.io image', async () => {
    const result = inferGithubRepo('ghcr.io/owner/repo@sha256:abcdef1234567890');
    expect(result).toBe('owner/repo');
  });

  it('returns null for an empty string', async () => {
    expect(inferGithubRepo('')).toBeNull();
  });

  it('strips docker.io before applying known-mapping lookup', async () => {
    expect(inferGithubRepo('docker.io/gitea/gitea')).toBe('go-gitea/gitea');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// extraMappings parameter
// ────────────────────────────────────────────────────────────────────────────
describe('inferGithubRepo – extraMappings', async () => {
  it('uses extraMappings to resolve an image that has no default mapping', async () => {
    const extra = { mycustomimg: 'myorg/mycustomrepo' };
    expect(inferGithubRepo('mycustomimg', extra)).toBe('myorg/mycustomrepo');
  });

  it('extraMappings override DEFAULT_IMAGE_MAPPINGS', async () => {
    const extra = { 'gitea/gitea': 'custom-org/custom-gitea' };
    expect(inferGithubRepo('gitea/gitea', extra)).toBe('custom-org/custom-gitea');
  });

  it('falls back to DEFAULT_IMAGE_MAPPINGS when extraMappings does not match', async () => {
    const extra = { 'some/other': 'org/other' };
    expect(inferGithubRepo('gitea/gitea', extra)).toBe('go-gitea/gitea');
  });

  it('extraMappings work after registry prefix stripping', async () => {
    const extra = { 'linuxserver/sonarr': 'custom-org/sonarr-fork' };
    expect(inferGithubRepo('ghcr.io/linuxserver/sonarr', extra)).toBe('custom-org/sonarr-fork');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DEFAULT_IMAGE_MAPPINGS export
// ────────────────────────────────────────────────────────────────────────────
describe('DEFAULT_IMAGE_MAPPINGS', async () => {
  it('is exported and contains known entries', async () => {
    expect(DEFAULT_IMAGE_MAPPINGS).toBeDefined();
    expect(DEFAULT_IMAGE_MAPPINGS['gitea/gitea']).toBe('go-gitea/gitea');
    expect(DEFAULT_IMAGE_MAPPINGS['traefik']).toBe('traefik/traefik');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// scanDockerDir – YAML validation
// ────────────────────────────────────────────────────────────────────────────
describe('scanDockerDir – YAML validation', async () => {
  it('skips compose files that parse to a non-object (e.g. a plain string)', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('"just a string"');

    expect(await scanDockerDir()).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(
      'Skipping compose file with invalid structure',
      expect.objectContaining({ filePath: expect.any(String) }),
    );
  });

  it('skips compose files where services is not an object (e.g. an array)', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  - item1\n  - item2\n');

    expect(await scanDockerDir()).toHaveLength(0);
  });

  it('logs a structured warning on YAML parse error', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(': invalid: yaml: [[[');

    await scanDockerDir();

    expect(console.warn).toHaveBeenCalledWith(
      'Skipping unreadable compose file',
      expect.objectContaining({ filePath: expect.any(String), error: expect.any(Error) }),
    );
  });
});
