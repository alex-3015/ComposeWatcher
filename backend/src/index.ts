import { buildApp } from './app.js';

const app = await buildApp();
const PORT = Number(process.env.PORT ?? 8080);

async function shutdown(): Promise<void> {
  await app.close();
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info({ port: PORT }, 'Backend listening');
