import { buildApp } from './app.js';

const app = await buildApp();
const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Backend listening on port ${PORT}`);
