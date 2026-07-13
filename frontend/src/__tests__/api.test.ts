import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, getContainers } from '../api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

describe('API client', () => {
  it('parses the v2 container envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        meta: {
          stale: false,
          refreshing: false,
          refreshedAt: null,
          refreshError: null,
          githubRateLimit: null,
        },
      }),
    });

    await expect(getContainers(false)).resolves.toMatchObject({ data: [], meta: { stale: false } });
    expect(fetchMock).toHaveBeenCalledWith('/api/containers', { signal: undefined });
  });

  it('throws structured API errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' } }),
    });

    await expect(getContainers(false)).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  });

  it('rejects malformed successful responses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });

    await expect(getContainers(false)).rejects.toEqual(
      new ApiClientError('Invalid container response.', 'INVALID_RESPONSE', 200),
    );
  });
});
