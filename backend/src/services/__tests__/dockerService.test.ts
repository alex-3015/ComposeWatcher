import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import type fs from 'fs';

// ── fs mock ────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Import AFTER mock declaration so imports receive the mock
import fsDefault from 'fs';
import { inferGithubRepo, scanDockerDir } from '../dockerService.js';

const mockFs = fsDefault as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  readdirSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
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
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ────────────────────────────────────────────────────────────────────────────
// inferGithubRepo
// ────────────────────────────────────────────────────────────────────────────
describe('inferGithubRepo', () => {
  // Registry stripping + path detection
  it('strips ghcr.io prefix and returns owner/repo', () => {
    expect(inferGithubRepo('ghcr.io/linuxserver/sonarr')).toBe('linuxserver/sonarr');
  });

  it('strips lscr.io prefix and returns owner/repo', () => {
    expect(inferGithubRepo('lscr.io/linuxserver/radarr')).toBe('linuxserver/radarr');
  });

  it('strips docker.io prefix and returns generic owner/repo', () => {
    expect(inferGithubRepo('docker.io/myorg/myapp')).toBe('myorg/myapp');
  });

  it('strips registry.hub.docker.com prefix', () => {
    expect(inferGithubRepo('registry.hub.docker.com/myorg/myapp')).toBe('myorg/myapp');
  });

  it('returns only first two path segments for deep ghcr.io paths', () => {
    expect(inferGithubRepo('ghcr.io/owner/repo/extra')).toBe('owner/repo');
  });

  // Known mappings
  it('maps gitea/gitea → go-gitea/gitea', () => {
    expect(inferGithubRepo('gitea/gitea')).toBe('go-gitea/gitea');
  });

  it('maps portainer/portainer-ce → portainer/portainer', () => {
    expect(inferGithubRepo('portainer/portainer-ce')).toBe('portainer/portainer');
  });

  it('maps portainer/portainer-ee → portainer/portainer', () => {
    expect(inferGithubRepo('portainer/portainer-ee')).toBe('portainer/portainer');
  });

  it('maps authelia/authelia → authelia/authelia', () => {
    expect(inferGithubRepo('authelia/authelia')).toBe('authelia/authelia');
  });

  it('maps single-name traefik → traefik/traefik', () => {
    expect(inferGithubRepo('traefik')).toBe('traefik/traefik');
  });

  it('maps single-name nginx → nginx/nginx', () => {
    expect(inferGithubRepo('nginx')).toBe('nginx/nginx');
  });

  it('maps nextcloud → nextcloud/nextcloud', () => {
    expect(inferGithubRepo('nextcloud')).toBe('nextcloud/nextcloud');
  });

  it('maps vaultwarden/server → dani-garcia/vaultwarden', () => {
    expect(inferGithubRepo('vaultwarden/server')).toBe('dani-garcia/vaultwarden');
  });

  it('maps adguard/adguardhome → AdguardTeam/AdGuardHome', () => {
    expect(inferGithubRepo('adguard/adguardhome')).toBe('AdguardTeam/AdGuardHome');
  });

  it('known mapping takes priority over ghcr.io path rule (ghcr.io/gitea/gitea)', () => {
    expect(inferGithubRepo('ghcr.io/gitea/gitea')).toBe('go-gitea/gitea');
  });

  // Generic 2-segment docker hub images
  it('returns owner/repo for generic 2-segment docker hub image', () => {
    expect(inferGithubRepo('myorg/myapp')).toBe('myorg/myapp');
  });

  // Null cases
  it('returns null for unknown single-segment image', () => {
    expect(inferGithubRepo('ubuntu')).toBeNull();
  });

  it('returns null for 2-segment image where first part contains a dot (custom registry)', () => {
    expect(inferGithubRepo('my.registry/myapp')).toBeNull();
  });

  it('returns null for 3-segment non-ghcr path', () => {
    expect(inferGithubRepo('customreg.io/owner/repo')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// scanDockerDir
// ────────────────────────────────────────────────────────────────────────────
describe('scanDockerDir', () => {
  it('returns empty array when DOCKER_DIR does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(scanDockerDir()).toEqual([]);
  });

  it('returns empty array when directory contains no compose files', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('README.md'), mockFile('.env')]);
    expect(scanDockerDir()).toEqual([]);
  });

  it('parses a simple docker-compose.yml with one service', () => {
    const composePath = path.join(DOCKER_DIR, 'docker-compose.yml');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  sonarr:\n    image: ghcr.io/linuxserver/sonarr:4.0.0\n');

    const result = scanDockerDir();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sonarr');
    expect(result[0].image).toBe('ghcr.io/linuxserver/sonarr');
    expect(result[0].currentVersion).toBe('4.0.0');
    expect(result[0].composeFile).toBe('docker-compose.yml');
    expect(result[0].githubRepo).toBe('linuxserver/sonarr');
    expect(result[0].status).toBe('unknown');
    expect(result[0].latestVersion).toBeNull();
  });

  it('assigns id as "composeFile::serviceName"', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  radarr:\n    image: myimg:1.0\n');

    const [c] = scanDockerDir();
    expect(c.id).toBe('docker-compose.yml::radarr');
  });

  it('uses "latest" as version when image has no tag', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image: myorg/myapp\n');

    const [c] = scanDockerDir();
    expect(c.currentVersion).toBe('latest');
    expect(c.image).toBe('myorg/myapp');
  });

  it('parses multiple services from one compose file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(
      'services:\n  sonarr:\n    image: sonarr:4.0\n  radarr:\n    image: radarr:5.0\n'
    );

    const result = scanDockerDir();
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(expect.arrayContaining(['sonarr', 'radarr']));
  });

  it('skips services without an image key', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n  db:\n    build: .\n');

    expect(scanDockerDir()).toHaveLength(0);
  });

  it('accepts all four compose file name variants', () => {
    const names = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    for (const name of names) {
      vi.clearAllMocks();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([mockFile(name)]);
      mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image: myapp:1.0\n');

      const result = scanDockerDir();
      expect(result).toHaveLength(1);
      expect(result[0].composeFile).toBe(name);
    }
  });

  it('ignores files that are not compose files', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml.bak'), mockFile('compose.txt')]);

    expect(scanDockerDir()).toHaveLength(0);
  });

  it('recurses into subdirectories', () => {
    const subDir = path.join(DOCKER_DIR, 'sonarr');
    const composePath = path.join(subDir, 'docker-compose.yml');

    mockFs.existsSync.mockImplementation((p) => p === DOCKER_DIR || p === subDir);
    mockFs.readdirSync.mockImplementation((p) => {
      if (p === DOCKER_DIR) return [mockDir('sonarr')];
      if (p === subDir) return [mockFile('docker-compose.yml')];
      return [];
    });
    mockFs.readFileSync.mockReturnValue('services:\n  sonarr:\n    image: sonarr:4.0\n');

    const result = scanDockerDir();
    expect(result).toHaveLength(1);
    expect(result[0].composeFile).toBe(path.join('sonarr', 'docker-compose.yml'));
  });

  it('skips compose files with invalid YAML and continues', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([
      mockFile('docker-compose.yml'),
      mockFile('compose.yml'),
    ]);
    mockFs.readFileSync
      .mockReturnValueOnce(': invalid: yaml: [[[')
      .mockReturnValueOnce('services:\n  app:\n    image: myapp:1.0\n');

    const result = scanDockerDir();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app');
  });

  it('skips compose files with no services key', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('version: "3"\n');

    expect(scanDockerDir()).toHaveLength(0);
  });

  it('correctly parses image with port-like colon in registry (no false tag split)', () => {
    // registry:5000/owner/repo:tag — lastColon is after "tag", not after port
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(
      'services:\n  app:\n    image: registry:5000/owner/repo:v1.2.3\n'
    );

    const [c] = scanDockerDir();
    expect(c.currentVersion).toBe('v1.2.3');
    expect(c.image).toBe('registry:5000/owner/repo');
  });

  it('skips service where image value is null in YAML', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    // YAML null value for image key
    mockFs.readFileSync.mockReturnValue('services:\n  app:\n    image:\n');
    expect(scanDockerDir()).toHaveLength(0);
  });

  it('documents parseImageVersion behaviour for registry:port/owner/repo without tag', () => {
    // registry:5000/owner/repo — parseImageVersion splits at the FIRST colon (position 8),
    // not recognising it as a port. This is a known limitation: no tag in this format.
    // The correct usage is always registry:5000/owner/repo:tag — see the test above.
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue(
      'services:\n  app:\n    image: registry:5000/owner/repo\n'
    );
    const [c] = scanDockerDir();
    // Current behaviour: splits at first colon → image='registry', version='5000/owner/repo'
    expect(c.image).toBe('registry');
    expect(c.currentVersion).toBe('5000/owner/repo');
  });

  it('recurses correctly into 3-level nested directories', () => {
    const l1 = path.join(DOCKER_DIR, 'media');
    const l2 = path.join(l1, 'arr');
    const composePath = path.join(l2, 'docker-compose.yml');

    mockFs.existsSync.mockImplementation((p) => [DOCKER_DIR, l1, l2].includes(p as string));
    mockFs.readdirSync.mockImplementation((p) => {
      if (p === DOCKER_DIR) return [mockDir('media')];
      if (p === l1) return [mockDir('arr')];
      if (p === l2) return [mockFile('docker-compose.yml')];
      return [];
    });
    mockFs.readFileSync.mockReturnValue('services:\n  sonarr:\n    image: sonarr:4.0\n');

    const result = scanDockerDir();
    expect(result).toHaveLength(1);
    expect(result[0].composeFile).toBe(path.join('media', 'arr', 'docker-compose.yml'));
  });

  it('handles compose file where services value is null', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([mockFile('docker-compose.yml')]);
    mockFs.readFileSync.mockReturnValue('services:\n');
    expect(scanDockerDir()).toHaveLength(0);
  });
});

describe('inferGithubRepo – additional edge cases', () => {
  it('returns an imperfect slug for a digest-only image (ghcr.io) — known limitation', () => {
    // ghcr.io/owner/repo@sha256:abc — after stripping registry: owner/repo@sha256:abc
    // split('/') = ['owner', 'repo@sha256:abc'] → returns 'owner/repo@sha256:abc'
    // The returned value contains the digest fragment — not a valid GitHub repo slug
    const result = inferGithubRepo('ghcr.io/owner/repo@sha256:abcdef1234567890');
    expect(result).toBe('owner/repo@sha256:abcdef1234567890');
  });

  it('returns null for an empty string', () => {
    expect(inferGithubRepo('')).toBeNull();
  });

  it('strips docker.io before applying known-mapping lookup', () => {
    expect(inferGithubRepo('docker.io/gitea/gitea')).toBe('go-gitea/gitea');
  });
});
