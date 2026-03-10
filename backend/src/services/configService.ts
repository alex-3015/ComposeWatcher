import fs from 'fs';
import path from 'path';
import type { Config } from '../types.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { repoMappings: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return { repoMappings: {}, ...parsed };
  } catch {
    return { repoMappings: {} };
  }
}

export function saveConfig(config: Config): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function setRepoMapping(containerId: string, repo: string | null): void {
  const config = loadConfig();
  if (repo === null) {
    delete config.repoMappings[containerId];
  } else {
    config.repoMappings[containerId] = repo;
  }
  saveConfig(config);
}
