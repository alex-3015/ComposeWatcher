import fs from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

const DEFAULT_WEB_ROOT = path.resolve(import.meta.dirname, '../../../frontend/dist');

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

/** Serves the built Vue app and locally cached icons from Fastify. */
export async function registerWebApp(
  app: FastifyInstance,
  webRoot = DEFAULT_WEB_ROOT,
  dataDirectory = process.env.DATA_DIR ?? '/data',
): Promise<void> {
  if (!(await directoryExists(webRoot))) {
    app.log.warn({ webRoot }, 'Frontend build not found; static serving is disabled');
    return;
  }

  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
    setHeaders(response: FastifyReply, filePath: string) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        response.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        response.header('Cache-Control', 'no-cache');
      }
    },
  });

  const iconsRoot = path.join(dataDirectory, 'icons');
  await fs.mkdir(iconsRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: iconsRoot,
    prefix: '/icons/',
    decorateReply: false,
    setHeaders(response: FastifyReply) {
      response.header('Cache-Control', 'public, max-age=604800');
    },
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = new URL(request.raw.url ?? request.url, 'http://localhost').pathname;
    const isApiPath = pathname === '/api' || pathname.startsWith('/api/');
    const isAssetPath =
      pathname === '/icons' ||
      pathname.startsWith('/icons/') ||
      pathname === '/assets' ||
      pathname.startsWith('/assets/') ||
      /\/[^/]+\.[^/]+$/.test(pathname);
    const acceptsHtml = request.headers.accept?.includes('text/html') ?? false;
    const isHtmlNavigation = (request.method === 'GET' || request.method === 'HEAD') && acceptsHtml;

    if (isApiPath || isAssetPath || !isHtmlNavigation) {
      reply.header('Cache-Control', 'no-store');
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Resource not found.' },
      });
    }
    const staticReply = reply as FastifyReply & {
      sendFile(fileName: string): FastifyReply;
    };
    staticReply.header('Cache-Control', 'no-cache');
    return staticReply.sendFile('index.html');
  });
}
