import fs from 'fs';
import path from 'path';
import type { Config } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

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

export function loadConfig(logger: ServiceLogger = consoleServiceLogger): Config {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { repoMappings: {} };
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null) {
      logger.warn({}, 'Config file has invalid structure, ignoring');
      return { repoMappings: {} };
    }
    const mappings = (parsed as Record<string, unknown>).repoMappings;
    if (typeof mappings !== 'object' || mappings === null || Array.isArray(mappings)) {
      return { repoMappings: {} };
    }
    const repoMappings = Object.fromEntries(
      Object.entries(mappings).filter(
        (entry): entry is [string, string] =>
          entry[0].includes('::') && typeof entry[1] === 'string' && REPO_REGEX.test(entry[1]),
      ),
    );
    return { repoMappings };
  } catch (err) {
    logger.error({ error: err }, 'Failed to load config');
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

export function setRepoMapping(
  containerId: string,
  repo: string | null,
  logger: ServiceLogger = consoleServiceLogger,
): void {
  const config = loadConfig(logger);
  if (repo === null || repo === '') {
    config.repoMappings = Object.fromEntries(
      Object.entries(config.repoMappings).filter(([key]) => key !== containerId),
    );
  } else {
    config.repoMappings[containerId] = repo;
  }
  saveConfig(config);
}
