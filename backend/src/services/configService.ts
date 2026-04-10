import fs from 'fs';
import path from 'path';
import type { Config } from '../types.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

let dataDirEnsured = false;

function ensureDataDir() {
  if (dataDirEnsured) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  dataDirEnsured = true;
}

/** Reset the ensureDataDir cache — useful for testing. */
export function resetDataDirCache(): void {
  dataDirEnsured = false;
}

export function loadConfig(): Config {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { repoMappings: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return { repoMappings: {}, ...parsed };
  } catch (err) {
    console.error('Failed to load config:', err);
    return { repoMappings: {} };
  }
}

export function saveConfig(config: Config): void {
  ensureDataDir();
  const tmpFile = `${CONFIG_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2));
  try {
    fs.renameSync(tmpFile, CONFIG_FILE);
  } catch (renameErr) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
    throw renameErr;
  }
}

export function setRepoMapping(containerId: string, repo: string | null): void {
  const config = loadConfig();
  if (repo === null || repo === '') {
    config.repoMappings = Object.fromEntries(
      Object.entries(config.repoMappings).filter(([key]) => key !== containerId),
    );
  } else {
    config.repoMappings[containerId] = repo;
  }
  saveConfig(config);
}
