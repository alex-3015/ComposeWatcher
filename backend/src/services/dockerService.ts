import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { ContainerInfo } from '../types.js';

const DOCKER_DIR = process.env.DOCKER_DIR ?? '/docker';

interface ComposeService {
  image?: string;
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

function parseImageVersion(image: string): { image: string; version: string } {
  const colonIdx = image.lastIndexOf(':');
  const slashIdx = image.lastIndexOf('/');
  const hasVersionTag = colonIdx !== -1 && colonIdx !== slashIdx + 1;
  if (!hasVersionTag) {
    return { image, version: 'latest' };
  }
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
export function inferGithubRepo(imageName: string): string | null {
  // Strip registry prefix
  const withoutRegistry = imageName.replace(/^(ghcr\.io|lscr\.io|docker\.io|registry\.hub\.docker\.com)\//, '');

  const knownMappings: Record<string, string> = {
    'gitea/gitea': 'go-gitea/gitea',
    'portainer/portainer-ce': 'portainer/portainer',
    'portainer/portainer-ee': 'portainer/portainer',
    'authelia/authelia': 'authelia/authelia',
    'traefik': 'traefik/traefik',
    'nginx': 'nginx/nginx',
    'nextcloud': 'nextcloud/nextcloud',
    'vaultwarden/server': 'dani-garcia/vaultwarden',
    'adguard/adguardhome': 'AdguardTeam/AdGuardHome',
  };

  if (knownMappings[withoutRegistry]) {
    return knownMappings[withoutRegistry];
  }

  // For ghcr.io images the path IS owner/repo
  if (imageName.startsWith('ghcr.io/') || imageName.startsWith('lscr.io/')) {
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

const COMPOSE_FILENAMES = new Set(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);

function findComposeFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findComposeFiles(fullPath));
    } else if (entry.isFile() && COMPOSE_FILENAMES.has(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function scanDockerDir(): ContainerInfo[] {
  const composeFiles = findComposeFiles(DOCKER_DIR);
  const containers: ContainerInfo[] = [];

  for (const filePath of composeFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content) as ComposeFile;

      if (!parsed?.services) continue;

      const relPath = path.relative(DOCKER_DIR, filePath);

      for (const [serviceName, service] of Object.entries(parsed.services)) {
        if (!service?.image) continue;

        const { image, version } = parseImageVersion(service.image);
        const id = `${relPath}::${serviceName}`;

        containers.push({
          id,
          name: serviceName,
          image,
          currentVersion: version,
          composeFile: relPath,
          githubRepo: inferGithubRepo(image),
          latestVersion: null,
          publishedAt: null,
          status: 'unknown',
          breakingChangeReason: null,
          releaseUrl: null,
          lastChecked: null,
        });
      }
    } catch (err) {
      console.error(`Failed to parse ${filePath}:`, err);
    }
  }

  return containers;
}
