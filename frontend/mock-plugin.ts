/**
 * Vite dev-server plugin that intercepts /api/* requests and returns mock data.
 * Activated by running:  MOCK=true npm run dev
 *
 * Simulates all container statuses so the frontend can be tested without a
 * running backend or Docker environment.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Import is done at runtime inside the plugin to avoid bundling issues.
// The mock data file is a plain TS module — tsx/vite handles it fine at dev time.

export function mockApiPlugin(): Plugin {
  return {
    name: 'mock-api',
    apply: 'serve',
    async configureServer(server) {
      // Dynamically import so the mock data file can use TS types freely.
      const { mockContainers } = await import('./src/mocks/data.ts');

      // Mutable state so POST /repo actually updates cards in the session.
      let containers = mockContainers.map((c) => ({ ...c }));
      // Simulated delay (ms) — set to 0 to disable.
      const DELAY = 400;

      function json(res: ServerResponse, data: unknown, status = 200) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      }

      function delay() {
        return new Promise<void>((r) => setTimeout(r, DELAY));
      }

      function readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve) => {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => resolve(body));
        });
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';

        // GET /icons/* — return 404 so frontend falls back to Package icon
        if (req.method === 'GET' && url.startsWith('/icons/')) {
          res.statusCode = 404;
          res.end();
          return;
        }

        // GET /api/containers
        if (req.method === 'GET' && (url === '/api/containers' || url === '/api/containers?refresh=true')) {
          await delay();
          return json(res, containers);
        }

        // POST /api/containers/:id/repo
        const repoMatch = url.match(/^\/api\/containers\/(.+)\/repo$/);
        if (req.method === 'POST' && repoMatch) {
          const id = decodeURIComponent(repoMatch[1]);
          const body = await readBody(req);
          const { repo } = JSON.parse(body) as { repo: string | null };
          await delay();
          containers = containers.map((c) =>
            c.id === id
              ? {
                  ...c,
                  githubRepo: repo,
                  status: repo === null ? 'no-repo' : c.status === 'no-repo' ? 'unknown' : c.status,
                }
              : c
          );
          return json(res, { ok: true });
        }

        // GET /api/config
        if (req.method === 'GET' && url === '/api/config') {
          const repoMappings = Object.fromEntries(
            containers.filter((c) => c.githubRepo).map((c) => [c.id, c.githubRepo!])
          );
          return json(res, { repoMappings });
        }

        next();
      });
    },
  };
}