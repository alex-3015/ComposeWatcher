import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  getContainerDetail,
  getContainers,
  saveRepository,
  startRefresh,
} from '../api';
import { detail, idleRefresh, meta, summary } from './factories';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => fetchMock.mockReset());

describe('v3 API client', () => {
  it('loads the lightweight collection', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: [summary()], meta: meta() }));
    await expect(getContainers()).resolves.toMatchObject({ data: [{ name: 'sonarr' }] });
    expect(fetchMock).toHaveBeenCalledWith('/api/containers', { signal: undefined });
  });

  it('loads detail data only through the encoded container endpoint', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: detail() }));
    await expect(getContainerDetail('media/compose.yml::app')).resolves.toMatchObject({
      data: { releaseNotes: '## Improvements' },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/containers/media%2Fcompose.yml%3A%3Aapp', {
      signal: undefined,
    });
  });

  it('starts a background refresh with POST', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ data: { ...idleRefresh, state: 'running', scope: 'all' } }),
    );
    await expect(startRefresh()).resolves.toMatchObject({ data: { state: 'running' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/refresh', { method: 'POST' });
  });

  it('updates a repository with PUT and a nullable body', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ data: summary({ githubRepo: null }), meta: { refresh: idleRefresh } }),
    );
    await saveRepository('docker-compose.yml::sonarr', null);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/containers/docker-compose.yml%3A%3Asonarr/repository',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ repo: null }) }),
    );
  });

  it('throws structured API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' } }, 400),
    );
    await expect(getContainers()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  });

  it('rejects malformed and non-JSON responses', async () => {
    fetchMock.mockResolvedValueOnce(response([])).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('bad json')),
    });
    await expect(getContainers()).rejects.toEqual(
      new ApiClientError('Invalid API response.', 'INVALID_RESPONSE', 200),
    );
    await expect(getContainers()).rejects.toEqual(
      new ApiClientError('HTTP 200', 'INVALID_RESPONSE', 200),
    );
  });
});
