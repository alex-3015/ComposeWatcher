import type { FastifyInstance } from 'fastify';
import {
  type ContainerSummary,
  ContainerDetailResponseSchema,
  ContainersResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  type HomepageWidgetData,
  HomepageWidgetResponseSchema,
  RefreshResponseSchema,
  RepositoryBodySchema,
  RepositoryResponseSchema,
} from '@composewatcher/contracts';
import { type ContainerCatalogApi, ContainerNotFoundError } from '../services/containerCatalog.js';

const containerIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 4, maxLength: 1024, pattern: '::' },
  },
} as const;

function publicError(code: string, message: string) {
  return { error: { code, message } };
}

function homepageWidgetData(containers: readonly ContainerSummary[]): HomepageWidgetData {
  return containers.reduce<HomepageWidgetData>(
    (counts, container) => {
      if (container.status === 'breaking-change') counts.breaking += 1;
      if (container.status === 'update-available') counts.updates += 1;
      if (container.dataState === 'error' || container.dataState === 'stale') {
        counts.checkFailed += 1;
      }
      return counts;
    },
    { breaking: 0, updates: 0, checkFailed: 0 },
  );
}

/** Registers the complete v3 HTTP API against a catalog instance. */
export async function registerApiRoutes(
  app: FastifyInstance,
  catalog: ContainerCatalogApi,
): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ContainerNotFoundError) {
      return reply.status(404).send(publicError('CONTAINER_NOT_FOUND', 'Container not found.'));
    }
    if (typeof error === 'object' && error !== null && 'validation' in error && error.validation) {
      return reply.status(400).send(publicError('VALIDATION_ERROR', 'Invalid request.'));
    }
    request.log.error(error);
    return reply.status(500).send(publicError('INTERNAL_ERROR', 'Internal server error.'));
  });

  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/health', { schema: { response: { 200: HealthResponseSchema } } }, async () => ({
    data: { status: 'ok' as const, version: '3.0.0' as const },
  }));

  app.get(
    '/api/containers',
    {
      schema: {
        response: {
          200: ContainersResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async () => catalog.list(),
  );

  app.get(
    '/api/homepage',
    {
      schema: {
        response: {
          200: HomepageWidgetResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async () => ({ data: homepageWidgetData(catalog.list().data) }),
  );

  app.get<{ Params: { id: string } }>(
    '/api/containers/:id',
    {
      schema: {
        params: containerIdParamsSchema,
        response: {
          200: ContainerDetailResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request) => ({ data: catalog.detail(request.params.id) }),
  );

  app.post(
    '/api/refresh',
    {
      schema: {
        response: {
          202: RefreshResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => reply.status(202).send({ data: catalog.startGlobalRefresh() }),
  );

  app.put<{ Params: { id: string }; Body: { repo: string | null } }>(
    '/api/containers/:id/repository',
    {
      schema: {
        params: containerIdParamsSchema,
        body: RepositoryBodySchema,
        response: {
          202: RepositoryResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(202).send(await catalog.updateRepository(request.params.id, request.body.repo)),
  );
}
