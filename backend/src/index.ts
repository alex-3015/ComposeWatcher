import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ContainerInfo } from './types.js';
import { scanDockerDir } from './services/dockerService.js';
import { enrichWithGithubData } from './services/githubService.js';
import { loadConfig, setRepoMapping } from './services/configService.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

let cache: { data: ContainerInfo[]; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getContainers(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const config = loadConfig();
  let containers = scanDockerDir();

  containers = containers.map((c) => ({
    ...c,
    githubRepo: config.repoMappings[c.id] ?? c.githubRepo,
  }));

  const enriched = await enrichWithGithubData(containers);
  cache = { data: enriched, ts: now };
  return enriched;
}

app.get('/api/containers', async (req, reply) => {
  const { refresh } = req.query as { refresh?: string };
  const data = await getContainers(refresh === 'true');
  return reply.send(data);
});

app.post<{ Params: { id: string }; Body: { repo: string | null } }>(
  '/api/containers/:id/repo',
  async (req, reply) => {
    const { id } = req.params;
    const { repo } = req.body;
    setRepoMapping(decodeURIComponent(id), repo);
    cache = null;
    return reply.send({ ok: true });
  }
);

app.get('/api/config', async (_req, reply) => {
  const config = loadConfig();
  return reply.send({ repoMappings: config.repoMappings });
});

const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Backend listening on port ${PORT}`);
