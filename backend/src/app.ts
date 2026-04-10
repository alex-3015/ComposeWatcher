import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ContainerInfo } from './types.js';
import { scanDockerDir } from './services/dockerService.js';
import { enrichWithGithubData } from './services/githubService.js';
import { loadConfig, setRepoMapping } from './services/configService.js';

export async function buildApp(opts?: { logger?: boolean }) {
  const app = Fastify({ logger: opts?.logger ?? true });

  const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
  await app.register(cors, {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((s) => s.trim()),
  });

  let cache: { data: ContainerInfo[]; ts: number } | null = null;
  let pendingRefresh: Promise<ContainerInfo[]> | null = null;
  const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;

  async function getContainers(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) {
      return cache.data;
    }

    // Coalesce concurrent refresh requests into a single in-flight call
    if (pendingRefresh) return pendingRefresh;

    pendingRefresh = (async () => {
      const config = loadConfig();
      let containers = scanDockerDir();

      containers = containers.map((c) => ({
        ...c,
        githubRepo: config.repoMappings[c.id] ?? c.githubRepo,
      }));

      const enriched = await enrichWithGithubData(containers);
      cache = { data: enriched, ts: Date.now() };
      return enriched;
    })();

    try {
      return await pendingRefresh;
    } finally {
      pendingRefresh = null;
    }
  }

  const REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

  app.get('/api/containers', async (req, reply) => {
    try {
      const { refresh } = req.query as { refresh?: string };
      const data = await getContainers(refresh === 'true');
      return reply.send(data);
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
