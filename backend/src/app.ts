import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ApiError, ContainerInfo, ContainersMeta } from './types.js';
import { scanDockerDir } from './services/dockerService.js';
import { enrichWithGithubData } from './services/githubService.js';
import { loadConfig, setRepoMapping } from './services/configService.js';
import { loadCachedContainers, saveCachedContainers } from './services/cacheService.js';
import { downloadIconsForContainers } from './services/iconService.js';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const BACKGROUND_RETRY_MS = 30_000;
const REPO_REGEX = '^[a-zA-Z0-9][a-zA-Z0-9._-]*\\/[a-zA-Z0-9][a-zA-Z0-9._-]*$';

interface CacheState {
  data: ContainerInfo[];
  ts: number;
}

interface GetContainersResult {
  data: ContainerInfo[];
  meta: ContainersMeta;
}

const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

const checkIssueSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'retryAt'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'repo-not-found',
            'rate-limited',
            'timeout',
            'network',
            'github-error',
            'invalid-release',
            'unverifiable-version',
          ],
        },
        message: { type: 'string' },
        retryAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    },
  ],
} as const;

const nullableStringSchema = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;

const containerSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'image',
    'currentVersion',
    'composeFile',
    'githubRepo',
    'latestVersion',
    'publishedAt',
    'status',
    'checkIssue',
    'breakingChangeReason',
    'releaseUrl',
    'releaseNotes',
    'releaseName',
    'lastChecked',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    image: { type: 'string' },
    currentVersion: { type: 'string' },
    composeFile: { type: 'string' },
    githubRepo: nullableStringSchema,
    latestVersion: nullableStringSchema,
    publishedAt: nullableStringSchema,
    status: {
      type: 'string',
      enum: ['up-to-date', 'update-available', 'breaking-change', 'unknown', 'no-repo'],
    },
    checkIssue: checkIssueSchema,
    breakingChangeReason: nullableStringSchema,
    releaseUrl: nullableStringSchema,
    releaseNotes: nullableStringSchema,
    releaseName: nullableStringSchema,
    lastChecked: nullableStringSchema,
  },
} as const;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function publicError(code: string, message: string): { error: ApiError } {
  return { error: { code, message } };
}

/** Builds the Fastify application without binding a network port. */
export async function buildApp(opts?: { logger?: boolean }) {
  const app = Fastify({
    logger: opts?.logger ?? true,
    ajv: { customOptions: { removeAdditional: false } },
  });
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (corsOrigin) {
    await app.register(cors, {
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((origin) => origin.trim()),
    });
  }

  let cache: CacheState | null = null;
  let pendingRefresh: Promise<ContainerInfo[]> | null = null;
  let lastRefreshError: ApiError | null = null;
  let lastRefreshAttemptAt = 0;
  let skipDiskCache = false;
  const cacheTtlMs = parsePositiveInteger(process.env.CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);

  async function refreshContainers(): Promise<ContainerInfo[]> {
    const config = loadConfig(app.log);
    const scanned = scanDockerDir(app.log).map((container) => ({
      ...container,
      githubRepo: config.repoMappings[container.id] ?? container.githubRepo,
    }));
    const enriched = await enrichWithGithubData(scanned, app.log);
    const refreshedAt = Date.now();
    cache = { data: enriched, ts: refreshedAt };
    lastRefreshError = null;
    skipDiskCache = false;
    saveCachedContainers(enriched);
    void downloadIconsForContainers(enriched).catch((error: unknown) => {
      app.log.warn({ error }, 'Icon download failed');
    });
    return enriched;
  }

  function startRefresh(): Promise<ContainerInfo[]> {
    if (pendingRefresh) return pendingRefresh;
    lastRefreshAttemptAt = Date.now();
    const refresh = refreshContainers().catch((error: unknown) => {
      lastRefreshError = { code: 'REFRESH_FAILED', message: 'Container refresh failed.' };
      throw error;
    });
    pendingRefresh = refresh;
    void refresh
      .finally(() => {
        if (pendingRefresh === refresh) pendingRefresh = null;
      })
      .catch(() => undefined);
    return refresh;
  }

  function resultFromCache(stale: boolean): GetContainersResult {
    if (!cache) throw new Error('Cache is not available');
    return {
      data: cache.data,
      meta: {
        stale,
        refreshing: pendingRefresh !== null,
        refreshedAt: new Date(cache.ts).toISOString(),
        refreshError: lastRefreshError,
      },
    };
  }

  async function getContainers(forceRefresh = false): Promise<GetContainersResult> {
    if (forceRefresh) {
      await startRefresh();
      return resultFromCache(false);
    }

    if (!cache && !skipDiskCache) {
      const diskData = loadCachedContainers(app.log);
      if (diskData) cache = { data: diskData.containers, ts: diskData.ts };
    }

    if (cache) {
      const stale = Date.now() - cache.ts >= cacheTtlMs;
      const retryDue =
        lastRefreshError === null || Date.now() - lastRefreshAttemptAt >= BACKGROUND_RETRY_MS;
      if (stale && !pendingRefresh && retryDue) {
        void startRefresh().catch((error: unknown) => {
          app.log.warn({ error }, 'Background refresh failed');
        });
      }
      return resultFromCache(stale);
    }

    await startRefresh();
    return resultFromCache(false);
  }

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === 'object' && error !== null && 'validation' in error && error.validation) {
      return reply.status(400).send(publicError('VALIDATION_ERROR', 'Invalid request.'));
    }
    request.log.error(error);
    return reply.status(500).send(publicError('INTERNAL_ERROR', 'Internal server error.'));
  });

  app.get(
    '/api/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                additionalProperties: false,
                required: ['status'],
                properties: { status: { type: 'string', const: 'ok' } },
              },
            },
          },
        },
      },
    },
    async () => ({ data: { status: 'ok' as const } }),
  );

  app.get<{ Querystring: { refresh?: string } }>(
    '/api/containers',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { refresh: { type: 'string', enum: ['true', 'false'] } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['data', 'meta'],
            properties: {
              data: { type: 'array', items: containerSchema },
              meta: {
                type: 'object',
                additionalProperties: false,
                required: ['stale', 'refreshing', 'refreshedAt', 'refreshError'],
                properties: {
                  stale: { type: 'boolean' },
                  refreshing: { type: 'boolean' },
                  refreshedAt: nullableStringSchema,
                  refreshError: { anyOf: [{ type: 'null' }, apiErrorSchema] },
                },
              },
            },
          },
        },
      },
    },
    async (request) => getContainers(request.query.refresh === 'true'),
  );

  app.post<{ Params: { id: string }; Body: { repo: string | null } }>(
    '/api/containers/:id/repo',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string', minLength: 4, maxLength: 1024, pattern: '::' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['repo'],
          properties: {
            repo: {
              anyOf: [
                { type: 'null' },
                { type: 'string', minLength: 3, maxLength: 200, pattern: REPO_REGEX },
              ],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const knownContainers = cache?.data ?? scanDockerDir(app.log);
      if (!knownContainers.some((container) => container.id === id)) {
        return reply.status(404).send(publicError('CONTAINER_NOT_FOUND', 'Container not found.'));
      }

      setRepoMapping(id, request.body.repo, app.log);
      cache = null;
      skipDiskCache = true;
      return reply.send({ data: { id, githubRepo: request.body.repo } });
    },
  );

  app.get('/api/config', async () => ({ data: loadConfig(app.log) }));

  return app;
}
