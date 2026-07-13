import type { Config, ContainersResponse } from './types';

interface DataResponse<T> {
  data: T;
}

interface ErrorResponse {
  error: { code: string; message: string };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as Record<string, unknown>).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

function isContainersResponse(value: unknown): value is ContainersResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Record<string, unknown>;
  if (
    !Array.isArray(response.data) ||
    typeof response.meta !== 'object' ||
    response.meta === null
  ) {
    return false;
  }
  const meta = response.meta as Record<string, unknown>;
  const rateLimit = meta.githubRateLimit as Record<string, unknown> | null;
  return (
    typeof meta.stale === 'boolean' &&
    typeof meta.refreshing === 'boolean' &&
    (typeof meta.refreshedAt === 'string' || meta.refreshedAt === null) &&
    (meta.refreshError === null || isErrorResponse({ error: meta.refreshError })) &&
    (rateLimit === null ||
      (typeof rateLimit === 'object' &&
        typeof rateLimit.limit === 'number' &&
        typeof rateLimit.remaining === 'number' &&
        typeof rateLimit.resetAt === 'string' &&
        typeof rateLimit.observedAt === 'string'))
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(`HTTP ${response.status}`, 'INVALID_RESPONSE', response.status);
  }
  if (!response.ok) {
    const error = isErrorResponse(body) ? body.error : null;
    throw new ApiClientError(
      error?.message ?? `HTTP ${response.status}`,
      error?.code ?? 'HTTP_ERROR',
      response.status,
    );
  }
  return body as T;
}

/** Fetches containers and their refresh metadata. */
export async function getContainers(
  forceRefresh: boolean,
  signal?: AbortSignal,
): Promise<ContainersResponse> {
  const suffix = forceRefresh ? '?refresh=true' : '';
  const response = await fetch(`/api/containers${suffix}`, { signal });
  const parsed = await parseResponse<unknown>(response);
  if (!isContainersResponse(parsed)) {
    throw new ApiClientError('Invalid container response.', 'INVALID_RESPONSE', response.status);
  }
  return parsed;
}

/** Persists a repository mapping for one known container. */
export async function saveRepository(
  containerId: string,
  repo: string | null,
): Promise<DataResponse<{ id: string; githubRepo: string | null }>> {
  const response = await fetch(`/api/containers/${encodeURIComponent(containerId)}/repo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo }),
  });
  return parseResponse(response);
}

/** Reads the persisted repository mapping configuration. */
export async function getConfig(signal?: AbortSignal): Promise<DataResponse<Config>> {
  const response = await fetch('/api/config', { signal });
  return parseResponse(response);
}
