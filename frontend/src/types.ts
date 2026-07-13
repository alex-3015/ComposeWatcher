export type ContainerStatus =
  'up-to-date' | 'update-available' | 'breaking-change' | 'unknown' | 'no-repo';

export type CheckIssueCode =
  | 'repo-not-found'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'github-error'
  | 'invalid-release'
  | 'unverifiable-version';

export interface CheckIssue {
  code: CheckIssueCode;
  message: string;
  retryAt: string | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  currentVersion: string;
  composeFile: string;
  githubRepo: string | null;
  latestVersion: string | null;
  publishedAt: string | null;
  status: ContainerStatus;
  checkIssue: CheckIssue | null;
  breakingChangeReason: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  releaseName: string | null;
  lastChecked: string | null;
}

export interface ContainersMeta {
  stale: boolean;
  refreshing: boolean;
  refreshedAt: string | null;
  refreshError: ApiError | null;
}

export interface ContainersResponse {
  data: ContainerInfo[];
  meta: ContainersMeta;
}

export interface Config {
  repoMappings: Record<string, string>;
}
