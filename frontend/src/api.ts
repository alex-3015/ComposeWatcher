import type {
  ContainerDetailResponse,
  ContainersResponse,
  RefreshResponse,
  RepositoryResponse,
} from './types';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  return typeof value.error.code === 'string' && typeof value.error.message === 'string';
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
  if (!isRecord(body) || !('data' in body)) {
    throw new ApiClientError('Invalid API response.', 'INVALID_RESPONSE', response.status);
  }
  return body as T;
}

/** Fetches the lightweight dashboard collection and current refresh metadata. */
export async function getContainers(signal?: AbortSignal): Promise<ContainersResponse> {
  const response = await fetch('/api/containers', { signal });
  return parseResponse<ContainersResponse>(response);
}

/** Fetches release notes and diagnostics for one container. */
export async function getContainerDetail(
  containerId: string,
  signal?: AbortSignal,
): Promise<ContainerDetailResponse> {
  const response = await fetch(`/api/containers/${encodeURIComponent(containerId)}`, { signal });
  return parseResponse<ContainerDetailResponse>(response);
}

/** Starts an idempotent asynchronous global refresh. */
export async function startRefresh(): Promise<RefreshResponse> {
  const response = await fetch('/api/refresh', { method: 'POST' });
  return parseResponse<RefreshResponse>(response);
}

/** Persists a repository override and starts targeted enrichment. */
export async function saveRepository(
  containerId: string,
  repo: string | null,
): Promise<RepositoryResponse> {
  const response = await fetch(`/api/containers/${encodeURIComponent(containerId)}/repository`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo }),
  });
  return parseResponse<RepositoryResponse>(response);
}
