import fs from 'fs';
import path from 'path';
import { load as loadYaml } from 'js-yaml';
import type { ContainerInfo } from '../types.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';

const DOCKER_DIR = process.env.DOCKER_DIR ?? '/docker';

interface ComposeService {
  image?: unknown;
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

/** Well-known Docker image → GitHub repo mappings. */
export const DEFAULT_IMAGE_MAPPINGS: Record<string, string> = {
  'gitea/gitea': 'go-gitea/gitea',
  'portainer/portainer-ce': 'portainer/portainer',
  'portainer/portainer-ee': 'portainer/portainer',
  'authelia/authelia': 'authelia/authelia',
  traefik: 'traefik/traefik',
  nginx: 'nginx/nginx',
  nextcloud: 'nextcloud/nextcloud',
  'vaultwarden/server': 'dani-garcia/vaultwarden',
  'adguard/adguardhome': 'AdguardTeam/AdGuardHome',
};

/** Matches known registry prefixes to strip from image names. */
const REGISTRY_PREFIX_RE = /^(ghcr\.io|lscr\.io|docker\.io|registry\.hub\.docker\.com)\//;

function parseImageVersion(image: string): { image: string; version: string } {
  // Handle digest-pinned images: image@sha256:abc...
  const atIdx = image.indexOf('@');
  if (atIdx !== -1) {
    return {
      image: image.substring(0, atIdx),
      version: image.substring(atIdx + 1),
    };
  }

  // A tag colon can only appear after the last '/' — this avoids confusing
  // a registry port (registry:5000/owner/repo) with a version tag.
  const slashIdx = image.lastIndexOf('/');
  const afterSlash = image.substring(slashIdx + 1);
  const colonInSegment = afterSlash.indexOf(':');
  if (colonInSegment === -1) {
    return { image, version: 'latest' };
  }
  const colonIdx = slashIdx + 1 + colonInSegment;
  return {
    image: image.substring(0, colonIdx),
    version: image.substring(colonIdx + 1),
  };
}

/** Try to infer a GitHub owner/repo from an image name.
 *  Examples:
 *    ghcr.io/linuxserver/sonarr       → linuxserver/sonarr
 *    lscr.io/linuxserver/radarr       → linuxserver/radarr
 *    gitea/gitea                      → go-gitea/gitea
 *    portainer/portainer-ce           → portainer/portainer-ce
 */
export function inferGithubRepo(
  imageName: string,
  extraMappings: Record<string, string> = {},
): string | null {
  // Strip digest suffix (@sha256:...)
  const atIdx = imageName.indexOf('@');
  const cleanName = atIdx !== -1 ? imageName.substring(0, atIdx) : imageName;

  // Strip registry prefix
  const withoutRegistry = cleanName.replace(REGISTRY_PREFIX_RE, '');

  const mappings = { ...DEFAULT_IMAGE_MAPPINGS, ...extraMappings };

  if (mappings[withoutRegistry]) {
    return mappings[withoutRegistry];
  }

  // For ghcr.io images the path IS owner/repo
  if (cleanName.startsWith('ghcr.io/') || cleanName.startsWith('lscr.io/')) {
    const parts = withoutRegistry.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  }

  // Two-segment docker hub images → likely owner/repo on GitHub
  const parts = withoutRegistry.split('/');
  if (parts.length === 2 && !parts[0].includes('.')) {
    return `${parts[0]}/${parts[1]}`;
  }

  return null;
}

const COMPOSE_FILENAMES = new Set([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);

async function findComposeFiles(dir: string, logger: ServiceLogger): Promise<string[]> {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const pending = [dir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) break;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      logger.warn({ directory: currentDir, error }, 'Skipping unreadable directory');
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && COMPOSE_FILENAMES.has(entry.name)) results.push(fullPath);
    }
  }
  return results.sort((left, right) => left.localeCompare(right));
}

export async function scanDockerDir(
  logger: ServiceLogger = consoleServiceLogger,
): Promise<ContainerInfo[]> {
  let composeFiles: string[];
  try {
    composeFiles = await findComposeFiles(DOCKER_DIR, logger);
  } catch (error) {
    logger.warn({ directory: DOCKER_DIR, error }, 'Unable to scan Docker directory');
    return [];
  }
  const containers: ContainerInfo[] = [];

  for (const filePath of composeFiles) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = loadYaml(content);

      if (parsed == null || typeof parsed !== 'object') {
        logger.warn({ filePath }, 'Skipping compose file with invalid structure');
        continue;
      }

      const compose = parsed as ComposeFile;

      if (!compose.services || typeof compose.services !== 'object') {
        logger.warn({ filePath }, 'Skipping compose file with invalid structure');
        continue;
      }

      const relPath = path.relative(DOCKER_DIR, filePath);

      for (const [serviceName, service] of Object.entries(compose.services).sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        if (typeof service?.image !== 'string' || service.image.trim().length === 0) continue;

        const { image, version } = parseImageVersion(service.image);
        const id = `${relPath}::${serviceName}`;

        containers.push({
          id,
          name: serviceName,
          image,
          currentVersion: version,
          composeFile: relPath,
          githubRepo: inferGithubRepo(image),
          latestUpstreamVersion: null,
          publishedAt: null,
          status: 'unknown',
          updateKind: null,
          comparisonMode: 'unverifiable',
          historyComplete: null,
          releaseDataStale: false,
          checkIssue: null,
          breakingChanges: [],
          releaseUrl: null,
          releaseNotes: null,
          releaseName: null,
          lastChecked: null,
        });
      }
    } catch (err) {
      logger.warn({ filePath, error: err }, 'Skipping unreadable compose file');
    }
  }

  return containers;
}
