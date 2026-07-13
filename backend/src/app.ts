import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import { registerWebApp } from './plugins/webApp.js';
import { registerApiRoutes } from './routes/apiRoutes.js';
import { ContainerCatalog, type ContainerCatalogApi } from './services/containerCatalog.js';

export interface BuildAppOptions {
  logger?: boolean;
  catalog?: ContainerCatalogApi;
  refreshOnStart?: boolean;
  serveFrontend?: boolean;
  webRoot?: string;
  dataDirectory?: string;
}

/** Builds and initializes the Fastify application without binding a port. */
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    ajv: { customOptions: { removeAdditional: false } },
  });

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (corsOrigin) {
    await app.register(cors, {
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((origin) => origin.trim()),
    });
  }

  await app.register(compress, {
    global: true,
    globalDecompression: false,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  const catalog = options.catalog ?? new ContainerCatalog(app.log);
  await catalog.initialize(options.refreshOnStart ?? true);
  await registerApiRoutes(app, catalog);
  if (options.serveFrontend ?? process.env.NODE_ENV === 'production') {
    await registerWebApp(app, options.webRoot, options.dataDirectory);
  }
  app.addHook('onClose', async () => catalog.close());
  return app;
}
