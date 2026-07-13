export type ContainerStatus =
  'up-to-date' | 'ahead' | 'update-available' | 'breaking-change' | 'unknown' | 'no-repo';

export type UpdateKind = 'major' | 'minor' | 'patch' | 'prerelease' | null;

export type ComparisonMode = 'exact' | 'normalized' | 'unverifiable';

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

export interface BreakingChange {
  version: string;
  releaseName: string | null;
  reason: string;
  releaseUrl: string;
}

export interface GithubRateLimit {
  limit: number;
  remaining: number;
  resetAt: string;
  observedAt: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  currentVersion: string;
  composeFile: string;
  githubRepo: string | null;
  latestUpstreamVersion: string | null;
  publishedAt: string | null;
  status: ContainerStatus;
  updateKind: UpdateKind;
  comparisonMode: ComparisonMode;
  historyComplete: boolean | null;
  releaseDataStale: boolean;
  checkIssue: CheckIssue | null;
  breakingChanges: BreakingChange[];
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
  githubRateLimit: GithubRateLimit | null;
}

export interface ContainersResponse {
  data: ContainerInfo[];
  meta: ContainersMeta;
}

export interface Config {
  repoMappings: Record<string, string>;
}
