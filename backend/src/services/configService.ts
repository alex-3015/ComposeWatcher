import path from 'path';
import type { Config } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';
import { readJson, writeJsonAtomic } from './atomicJsonStore.js';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function loadConfig(logger: ServiceLogger = consoleServiceLogger): Promise<Config> {
  try {
    const parsed = await readJson(CONFIG_FILE);
    if (parsed === null) return { repoMappings: {} };
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
        (entry): entry is [string, string | null] =>
          entry[0].includes('::') &&
          (entry[1] === null || (typeof entry[1] === 'string' && REPO_REGEX.test(entry[1]))),
      ),
    );
    return { repoMappings };
  } catch (err) {
    logger.error({ error: err }, 'Failed to load config');
    return { repoMappings: {} };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await writeJsonAtomic(CONFIG_FILE, config);
}

export async function setRepoMapping(
  containerId: string,
  repo: string | null,
  logger: ServiceLogger = consoleServiceLogger,
): Promise<void> {
  const config = await loadConfig(logger);
  config.repoMappings[containerId] = repo === '' ? null : repo;
  await saveConfig(config);
}
