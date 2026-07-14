import type { ContainerSummary, ContainerStatus } from './types';
import { STATUS_THEME } from './theme';

export type ContainerPresentationInput = Pick<
  ContainerSummary,
  | 'status'
  | 'dataState'
  | 'checkIssue'
  | 'currentVersion'
  | 'latestUpstreamVersion'
  | 'githubRepo'
  | 'breakingChangeCount'
>;

export interface ContainerStatusPresentation {
  label: string;
  description: string | null;
  themeStatus: ContainerStatus;
}

const ROLLING_TAGS = new Set(['latest', 'release', 'stable', 'edge', 'main', 'master', 'nightly']);

function isClearlyUnverifiableTag(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.includes('${') ||
    /\$[a-zA-Z_][a-zA-Z0-9_]*/.test(trimmed) ||
    trimmed.toLowerCase().startsWith('sha256:') ||
    ROLLING_TAGS.has(trimmed.toLowerCase())
  );
}

function isNotComparable(container: ContainerPresentationInput): boolean {
  return (
    container.status === 'unknown' &&
    (isClearlyUnverifiableTag(container.currentVersion) ||
      container.checkIssue?.code === 'unverifiable-version')
  );
}

function unverifiableDescription(container: ContainerPresentationInput): string {
  const version = container.currentVersion.trim();
  const lower = version.toLowerCase();
  if (version.includes('${') || /\$[a-zA-Z_][a-zA-Z0-9_]*/.test(version)) {
    return 'The Compose variable in this image tag could not be resolved.';
  }
  if (lower.startsWith('sha256:')) {
    return 'Digest-pinned images cannot be compared with GitHub release versions.';
  }
  if (ROLLING_TAGS.has(lower)) {
    return `The rolling tag "${version}" does not identify a comparable version.`;
  }
  return container.checkIssue?.message ?? 'The configured image tag cannot be compared reliably.';
}

export function getContainerStatusPresentation(
  container: ContainerPresentationInput,
): ContainerStatusPresentation {
  if (
    container.status === 'no-repo' ||
    container.dataState === 'unlinked' ||
    !container.githubRepo
  ) {
    return {
      label: 'Repository needed',
      description: 'Link a GitHub repository to enable release checks.',
      themeStatus: 'no-repo',
    };
  }

  if (container.dataState === 'error') {
    return {
      label: 'Check failed',
      description: container.checkIssue?.message ?? 'The release check did not complete.',
      themeStatus: 'unknown',
    };
  }

  if (container.status === 'unknown' && container.dataState === 'pending') {
    return {
      label: 'Checking…',
      description: 'Release data is being refreshed.',
      themeStatus: 'unknown',
    };
  }

  if (isNotComparable(container)) {
    return {
      label: 'Not comparable',
      description: unverifiableDescription(container),
      themeStatus: 'unknown',
    };
  }

  if (container.status === 'unknown' && container.checkIssue?.code === 'invalid-release') {
    return {
      label: 'No comparable release',
      description: container.checkIssue.message,
      themeStatus: 'unknown',
    };
  }

  if (container.status === 'unknown') {
    return {
      label: 'Check unavailable',
      description: container.checkIssue?.message ?? 'No reliable release comparison is available.',
      themeStatus: 'unknown',
    };
  }

  const count = container.breakingChangeCount;
  const label =
    container.status === 'breaking-change' && count > 0
      ? `${count} breaking hint${count === 1 ? '' : 's'}`
      : STATUS_THEME[container.status].badgeLabel;
  let description: string | null = null;
  if (container.dataState === 'stale') {
    description = container.checkIssue?.message
      ? `Cached release data: ${container.checkIssue.message}`
      : 'Showing cached release data because the latest check failed.';
  } else if (container.dataState === 'pending') {
    description = 'Checking for newer releases in the background.';
  }

  return { label, description, themeStatus: container.status };
}

export function getUpstreamVersionLabel(container: ContainerPresentationInput): string {
  if (container.latestUpstreamVersion) return container.latestUpstreamVersion;
  if (container.dataState === 'pending') return 'Checking…';
  if (container.status === 'no-repo' || container.dataState === 'unlinked') {
    return 'Repository required';
  }
  if (isNotComparable(container)) return 'Not comparable';
  if (container.dataState === 'error') return 'Check failed';
  return 'No release found';
}
