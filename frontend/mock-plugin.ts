import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function mockApiPlugin(): Plugin {
  return {
    name: 'mock-api-v3',
    apply: 'serve',
    async configureServer(server) {
      const { mockContainers, mockContainerDetails } = await import('./src/mocks/data.ts');
      function createState() {
        return {
          containers: mockContainers.map((container) => ({ ...container })),
          details: mockContainerDetails.map((detail) => ({ ...detail })),
          refreshRunning: false,
        };
      }

      type MockApiState = ReturnType<typeof createState>;

      const sharedState = createState();
      const isolatedStates = new Map<string, MockApiState>();
      const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 150));

      function stateFor(request: IncomingMessage): MockApiState {
        const header = request.headers['x-composewatcher-mock-session'];
        const sessionId = Array.isArray(header) ? header[0] : header;
        if (!sessionId) return sharedState;
        const current = isolatedStates.get(sessionId);
        if (current) return current;
        const created = createState();
        isolatedStates.set(sessionId, created);
        return created;
      }

      function json(response: ServerResponse, data: unknown, status = 200): void {
        response.statusCode = status;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(data));
      }

      function refreshMeta(state: MockApiState) {
        return {
          state: state.refreshRunning ? ('running' as const) : ('idle' as const),
          scope: state.refreshRunning ? ('all' as const) : null,
          containerId: null,
          startedAt: state.refreshRunning ? new Date().toISOString() : null,
          finishedAt: state.refreshRunning ? null : new Date().toISOString(),
          error: null,
        };
      }

      async function readBody(request: IncomingMessage): Promise<string> {
        return new Promise((resolve) => {
          let body = '';
          request.on('data', (chunk: Buffer) => (body += chunk.toString()));
          request.on('end', () => resolve(body));
        });
      }

      server.middlewares.use(async (request, response, next) => {
        const url = request.url ?? '';
        const state = stateFor(request);
        if (request.method === 'GET' && url.startsWith('/icons/')) {
          response.statusCode = 404;
          return response.end();
        }

        if (request.method === 'GET' && url === '/api/containers') {
          await delay();
          return json(response, {
            data: state.containers,
            meta: {
              refresh: refreshMeta(state),
              refreshedAt: new Date().toISOString(),
              githubRateLimit: {
                limit: 5000,
                remaining: 4988,
                resetAt: new Date(Date.now() + 3_600_000).toISOString(),
                observedAt: new Date().toISOString(),
              },
            },
          });
        }

        if (request.method === 'POST' && url === '/api/refresh') {
          state.refreshRunning = true;
          setTimeout(() => (state.refreshRunning = false), 800);
          return json(response, { data: refreshMeta(state) }, 202);
        }

        const detailMatch = url.match(/^\/api\/containers\/([^/]+)$/);
        if (request.method === 'GET' && detailMatch) {
          await delay();
          const id = decodeURIComponent(detailMatch[1]);
          const detail = state.details.find((candidate) => candidate.id === id);
          return detail
            ? json(response, { data: detail })
            : json(
                response,
                { error: { code: 'CONTAINER_NOT_FOUND', message: 'Container not found.' } },
                404,
              );
        }

        const repositoryMatch = url.match(/^\/api\/containers\/([^/]+)\/repository$/);
        if (request.method === 'PUT' && repositoryMatch) {
          const id = decodeURIComponent(repositoryMatch[1]);
          const { repo } = JSON.parse(await readBody(request)) as { repo: string | null };
          const index = state.containers.findIndex((candidate) => candidate.id === id);
          if (index < 0) {
            return json(
              response,
              { error: { code: 'CONTAINER_NOT_FOUND', message: 'Container not found.' } },
              404,
            );
          }
          const updated = {
            ...state.containers[index],
            githubRepo: repo,
            status: repo ? ('unknown' as const) : ('no-repo' as const),
            dataState: repo ? ('pending' as const) : ('unlinked' as const),
          };
          state.containers[index] = updated;
          state.details = state.details.map((detail) =>
            detail.id === id
              ? { ...detail, ...updated, breakingChanges: detail.breakingChanges }
              : detail,
          );
          return json(
            response,
            {
              data: updated,
              meta: {
                refresh: {
                  ...refreshMeta(state),
                  state: repo ? 'running' : 'idle',
                  scope: repo ? 'container' : null,
                  containerId: repo ? id : null,
                },
              },
            },
            202,
          );
        }
        next();
      });
    },
  };
}
