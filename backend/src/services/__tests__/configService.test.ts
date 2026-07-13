import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dataDirectory: string;

async function subject() {
  vi.resetModules();
  return import('../configService.js');
}

beforeEach(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'composewatcher-config-'));
  process.env.DATA_DIR = dataDirectory;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dataDirectory, { recursive: true, force: true });
});

describe('configService', () => {
  it('returns an empty config when no file exists', async () => {
    const { loadConfig } = await subject();
    await expect(loadConfig()).resolves.toEqual({ repoMappings: {} });
  });

  it('loads valid string and explicit-null mappings', async () => {
    await fs.writeFile(
      path.join(dataDirectory, 'config.json'),
      JSON.stringify({ repoMappings: { 'a.yml::app': 'owner/repo', 'b.yml::app': null } }),
    );
    const { loadConfig } = await subject();
    await expect(loadConfig()).resolves.toEqual({
      repoMappings: { 'a.yml::app': 'owner/repo', 'b.yml::app': null },
    });
  });

  it('drops malformed IDs and repositories', async () => {
    await fs.writeFile(
      path.join(dataDirectory, 'config.json'),
      JSON.stringify({ repoMappings: { bad: 'owner/repo', 'a.yml::app': 'not a repo' } }),
    );
    const { loadConfig } = await subject();
    await expect(loadConfig()).resolves.toEqual({ repoMappings: {} });
  });

  it('falls back safely for malformed JSON', async () => {
    await fs.writeFile(path.join(dataDirectory, 'config.json'), '{bad');
    const logger = { warn: vi.fn(), error: vi.fn() };
    const { loadConfig } = await subject();
    await expect(loadConfig(logger)).resolves.toEqual({ repoMappings: {} });
    expect(logger.error).toHaveBeenCalled();
  });

  it('writes a complete config atomically', async () => {
    const { saveConfig } = await subject();
    await saveConfig({ repoMappings: { 'a.yml::app': 'owner/repo' } });
    await expect(
      fs.readFile(path.join(dataDirectory, 'config.json'), 'utf8').then(JSON.parse),
    ).resolves.toEqual({ repoMappings: { 'a.yml::app': 'owner/repo' } });
    expect((await fs.readdir(dataDirectory)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });

  it('persists an explicit unlink instead of reviving inferred mappings', async () => {
    const { setRepoMapping, loadConfig } = await subject();
    await setRepoMapping('a.yml::app', null);
    await expect(loadConfig()).resolves.toEqual({ repoMappings: { 'a.yml::app': null } });
  });
});
