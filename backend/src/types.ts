import type {
  BreakingChange,
  CheckIssue,
  ComparisonMode,
  ContainerStatus,
  UpdateKind,
} from '@composewatcher/contracts';

export type {
  ApiError,
  BreakingChange,
  CheckIssue,
  CheckIssueCode,
  ComparisonMode,
  ContainerDetail,
  ContainerStatus,
  ContainerSummary,
  ContainersMeta,
  ContainersResponse,
  DataState,
  GithubRateLimit,
  HomepageWidgetData,
  HomepageWidgetResponse,
  RefreshMeta,
  UpdateKind,
} from '@composewatcher/contracts';

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

export type RepoMapping = Record<string, string | null>; // containerId -> "owner/repo" or explicit unlink

export interface Config {
  repoMappings: RepoMapping;
}

export interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}
