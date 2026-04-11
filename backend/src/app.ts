import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ContainerInfo } from './types.js';
import { scanDockerDir } from './services/dockerService.js';
import { enrichWithGithubData } from './services/githubService.js';
import { loadConfig, setRepoMapping } from './services/configService.js';
import { loadCachedContainers, saveCachedContainers } from './services/cacheService.js';
import { downloadIconsForContainers } from './services/iconService.js';

interface GetContainersResult {
  data: ContainerInfo[];
  stale: boolean;
}

export async function buildApp(opts?: { logger?: boolean }) {
  const app = Fastify({ logger: opts?.logger ?? true });

  const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
  await app.register(cors, {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((s) => s.trim()),
  });

  let cache: { data: ContainerInfo[]; ts: number } | null = null;
  let pendingRefresh: Promise<ContainerInfo[]> | null = null;
  const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;

  /** Run the full scan+enrich pipeline and persist results. */
  async function refreshContainers(): Promise<ContainerInfo[]> {
    const config = loadConfig();
    let containers = scanDockerDir();

    containers = containers.map((c) => ({
      ...c,
      githubRepo: config.repoMappings[c.id] ?? c.githubRepo,
    }));

    const enriched = await enrichWithGithubData(containers);
    cache = { data: enriched, ts: Date.now() };
    saveCachedContainers(enriched);
    downloadIconsForContainers(enriched).catch((err) =>
      console.warn('Icon download failed:', err),
    );
    return enriched;
  }

  async function getContainers(forceRefresh = false): Promise<GetContainersResult> {
    const now = Date.now();

    // Memory cache hit
    if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) {
      return { data: cache.data, stale: false };
    }

    // Coalesce concurrent refresh requests into a single in-flight call
    if (pendingRefresh) {
      const data = await pendingRefresh;
      return { data, stale: false };
    }

    // Cold start: try disk cache and return stale data while refreshing in background
    if (!forceRefresh && !cache) {
      const diskData = loadCachedContainers();
      if (diskData) {
        cache = { data: diskData.containers, ts: diskData.ts };

        // Fire background refresh (coalesced via pendingRefresh)
        pendingRefresh = refreshContainers();
        pendingRefresh
          .catch((err) => console.warn('Background refresh failed:', err))
          .finally(() => {
            pendingRefresh = null;
          });

        return { data: diskData.containers, stale: true };
      }
    }

    // Synchronous refresh (first-ever start or force refresh)
    pendingRefresh = refreshContainers();
    try {
      const data = await pendingRefresh;
      return { data, stale: false };
    } finally {
      pendingRefresh = null;
    }
  }

  const REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

  app.get('/api/containers', async (req, reply) => {
    try {
      const { refresh } = req.query as { refresh?: string };
      const result = await getContainers(refresh === 'true');
      if (result.stale) {
        void reply.header('X-Data-Stale', 'true');
      }
      return reply.send(result.data);
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post<{ Params: { id: string }; Body: { repo: string | null } }>(
    '/api/containers/:id/repo',
    async (req, reply) => {
      try {
        const { id } = req.params;
        const decodedId = decodeURIComponent(id);

        if (!decodedId.includes('::')) {
          return reply.status(400).send({
            error:
              'Invalid container ID: must contain "::" separator (e.g. "compose.yml::service")',
          });
        }

        const { repo } = req.body;
        if (repo !== null && !REPO_REGEX.test(repo)) {
          return reply.status(400).send({
            error: 'Invalid repo format: must be "owner/repo" (e.g. "linuxserver/sonarr")',
          });
        }

        setRepoMapping(decodedId, repo);
        cache = null;
        return reply.send({ ok: true });
      } catch (err) {
        req.log.error(err);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    },
  );

  app.get('/api/config', async (req, reply) => {
    try {
      const config = loadConfig();
      return reply.send({ repoMappings: config.repoMappings });
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  return app;
}
