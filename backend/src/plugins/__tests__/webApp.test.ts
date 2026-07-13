import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerWebApp } from '../webApp.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-watcher-web-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('web app plugin', () => {
  it('skips static serving when no production build exists', async () => {
    const app = Fastify({ logger: false });
    await registerWebApp(app, path.join(await temporaryDirectory(), 'missing'));
    expect((await app.inject('/dashboard')).statusCode).toBe(404);
    await app.close();
  });

  it('serves the SPA, immutable assets, and cached icons', async () => {
    const root = await temporaryDirectory();
    const webRoot = path.join(root, 'web');
    const dataRoot = path.join(root, 'data');
    await fs.mkdir(path.join(webRoot, 'assets'), { recursive: true });
    await fs.mkdir(path.join(dataRoot, 'icons'), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(webRoot, 'index.html'), '<main>Compose Watcher</main>'),
      fs.writeFile(path.join(webRoot, 'assets', 'app.js'), 'console.log("v3")'),
      fs.writeFile(path.join(dataRoot, 'icons', 'app.svg'), '<svg/>'),
    ]);

    const app = Fastify({ logger: false });
    await registerWebApp(app, webRoot, dataRoot);

    const index = await app.inject('/');
    const asset = await app.inject('/assets/app.js');
    const icon = await app.inject('/icons/app.svg');
    const fallback = await app.inject('/containers/app');
    const apiMissing = await app.inject('/api/missing');

    expect(index.body).toContain('Compose Watcher');
    expect(index.headers['cache-control']).toBe('no-cache');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(icon.headers['cache-control']).toBe('public, max-age=604800');
    expect(fallback.body).toContain('Compose Watcher');
    expect(apiMissing.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found.' },
    });
    await app.close();
  });
});
