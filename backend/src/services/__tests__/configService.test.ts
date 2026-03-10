import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ── fs mock ────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}));

import fsDefault from 'fs';
import { loadConfig, saveConfig, setRepoMapping } from '../configService.js';

const mockFs = fsDefault as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
};

// Replicate module-level constants (must match configService.ts logic)
const DATA_DIR = '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

beforeEach(() => vi.clearAllMocks());

// ────────────────────────────────────────────────────────────────────────────
// loadConfig
// ────────────────────────────────────────────────────────────────────────────
describe('loadConfig', () => {
  it('returns default config when config file does not exist', () => {
    mockFs.existsSync.mockImplementation((p) => p === DATA_DIR); // dir exists, file does not
    const config = loadConfig();
    expect(config).toEqual({ repoMappings: {} });
  });

  it('returns default config when DATA_DIR does not exist (creates dir)', () => {
    mockFs.existsSync.mockReturnValue(false);
    const config = loadConfig();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
    expect(config).toEqual({ repoMappings: {} });
  });

  it('does not call mkdirSync when DATA_DIR already exists', () => {
    mockFs.existsSync.mockImplementation((p) => p === DATA_DIR);
    loadConfig();
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  it('returns parsed config when file exists and is valid JSON', () => {
    const storedConfig = { repoMappings: { 'compose.yml::app': 'myorg/myapp' } };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(storedConfig));

    const config = loadConfig();
    expect(config).toEqual(storedConfig);
  });

  it('returns default config when file contains invalid JSON', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{invalid json}}}');
    const config = loadConfig();
    expect(config).toEqual({ repoMappings: {} });
  });

  it('returns default config when readFileSync throws', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
    const config = loadConfig();
    expect(config).toEqual({ repoMappings: {} });
  });

  it('reads from the correct file path', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{"repoMappings":{}}');
    loadConfig();
    expect(mockFs.readFileSync).toHaveBeenCalledWith(CONFIG_FILE, 'utf-8');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// saveConfig
// ────────────────────────────────────────────────────────────────────────────
describe('saveConfig', () => {
  it('writes config as pretty-printed JSON to the correct path', () => {
    mockFs.existsSync.mockReturnValue(true);
    const config = { repoMappings: { 'a::b': 'owner/repo' } };

    saveConfig(config);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      CONFIG_FILE,
      JSON.stringify(config, null, 2)
    );
  });

  it('creates DATA_DIR if it does not exist before writing', () => {
    mockFs.existsSync.mockReturnValue(false);
    saveConfig({ repoMappings: {} });
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
  });

  it('preserves all repoMappings entries when writing', () => {
    mockFs.existsSync.mockReturnValue(true);
    const config = {
      repoMappings: {
        'compose.yml::app1': 'org/app1',
        'compose.yml::app2': 'org/app2',
      },
    };
    saveConfig(config);
    const written = JSON.parse((mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    expect(written.repoMappings).toEqual(config.repoMappings);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// setRepoMapping
// ────────────────────────────────────────────────────────────────────────────
describe('setRepoMapping', () => {
  function getWrittenConfig() {
    const calls = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
    return JSON.parse(calls[calls.length - 1][1]);
  }

  it('adds a new repo mapping', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{"repoMappings":{}}');

    setRepoMapping('compose.yml::sonarr', 'linuxserver/sonarr');

    expect(getWrittenConfig().repoMappings).toEqual({
      'compose.yml::sonarr': 'linuxserver/sonarr',
    });
  });

  it('overwrites an existing repo mapping', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      '{"repoMappings":{"compose.yml::app":"old/repo"}}'
    );

    setRepoMapping('compose.yml::app', 'new/repo');

    expect(getWrittenConfig().repoMappings['compose.yml::app']).toBe('new/repo');
  });

  it('removes a repo mapping when repo is null', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      '{"repoMappings":{"compose.yml::app":"org/repo","compose.yml::other":"org/other"}}'
    );

    setRepoMapping('compose.yml::app', null);

    const written = getWrittenConfig();
    expect(written.repoMappings).not.toHaveProperty('compose.yml::app');
    expect(written.repoMappings).toHaveProperty('compose.yml::other');
  });

  it('is a no-op removal when containerId does not exist', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{"repoMappings":{"a::b":"org/repo"}}');

    setRepoMapping('nonexistent::svc', null);

    expect(getWrittenConfig().repoMappings).toEqual({ 'a::b': 'org/repo' });
  });

  it('preserves existing mappings when adding a new one', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      '{"repoMappings":{"a::existing":"org/existing"}}'
    );

    setRepoMapping('b::new', 'org/new');

    const written = getWrittenConfig();
    expect(written.repoMappings['a::existing']).toBe('org/existing');
    expect(written.repoMappings['b::new']).toBe('org/new');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────────────
describe('loadConfig – edge cases', () => {
  it('returns empty repoMappings when file contains an empty object (no repoMappings key)', () => {
    // Stored JSON is valid but missing repoMappings — loadConfig merges defaults
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{}');
    const config = loadConfig();
    expect(config.repoMappings).toEqual({});
  });

  it('returns default config for an empty file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('');
    const config = loadConfig();
    expect(config).toEqual({ repoMappings: {} });
  });
});

describe('saveConfig – edge cases', () => {
  it('propagates error when writeFileSync throws', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementationOnce(() => { throw new Error('Disk full'); });
    expect(() => saveConfig({ repoMappings: {} })).toThrow('Disk full');
  });

});

describe('setRepoMapping – edge cases', () => {
  function getWrittenConfig() {
    const calls = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
    return JSON.parse(calls[calls.length - 1][1]);
  }

  it('stores an empty string repo value without treating it as null', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{"repoMappings":{}}');
    setRepoMapping('compose.yml::app', '');
    // Empty string is truthy-falsy edge: '' is falsy, but repo !== null, so it should be stored
    // Current behaviour: repo is '' which is not null, so it will be stored as ''
    expect(getWrittenConfig().repoMappings['compose.yml::app']).toBe('');
  });

  it('handles containerId with URL-like characters (encoded slash)', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{"repoMappings":{}}');
    setRepoMapping('sub%2Fdir/compose.yml::app', 'org/repo');
    expect(getWrittenConfig().repoMappings['sub%2Fdir/compose.yml::app']).toBe('org/repo');
  });
});
