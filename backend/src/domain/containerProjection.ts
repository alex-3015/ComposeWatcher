import type { ContainerDetail, ContainerSummary, DataState } from '@composewatcher/contracts';
import type { ContainerInfo } from '../types.js';
import { getIconFileName } from '../services/iconService.js';

const NO_ICONS: ReadonlySet<string> = new Set();

function getDataState(container: ContainerInfo, pending: boolean): DataState {
  if (!container.githubRepo) return 'unlinked';
  if (pending) return 'pending';
  if (container.releaseDataStale) return 'stale';
  if (container.checkIssue && container.checkIssue.code !== 'unverifiable-version') return 'error';
  if (!container.lastChecked && !container.checkIssue) return 'pending';
  return 'fresh';
}

/** Projects the internal enrichment model into the public detail contract. */
export function toContainerDetail(
  container: ContainerInfo,
  pending = false,
  availableIcons: ReadonlySet<string> = NO_ICONS,
): ContainerDetail {
  const iconFileName = getIconFileName(container.name);
  return {
    id: container.id,
    name: container.name,
    image: container.image,
    currentVersion: container.currentVersion,
    composeFile: container.composeFile,
    githubRepo: container.githubRepo,
    iconUrl:
      iconFileName && availableIcons.has(iconFileName)
        ? `/icons/${encodeURIComponent(iconFileName)}`
        : null,
    latestUpstreamVersion: container.latestUpstreamVersion,
    publishedAt: container.publishedAt,
    status: container.status,
    dataState: getDataState(container, pending),
    updateKind: container.updateKind,
    comparisonMode: container.comparisonMode,
    checkIssue: container.checkIssue,
    breakingChangeCount: container.breakingChanges.length,
    releaseUrl: container.releaseUrl,
    lastChecked: container.lastChecked,
    historyComplete: container.historyComplete,
    releaseName: container.releaseName,
    releaseNotes: container.releaseNotes,
    breakingChanges: container.breakingChanges,
  };
}

/** Removes large release fields from a detail object for collection responses. */
export function toContainerSummary(
  container: ContainerInfo,
  pending = false,
  availableIcons: ReadonlySet<string> = NO_ICONS,
): ContainerSummary {
  const detail: Partial<ContainerDetail> = {
    ...toContainerDetail(container, pending, availableIcons),
  };
  delete detail.historyComplete;
  delete detail.releaseName;
  delete detail.releaseNotes;
  delete detail.breakingChanges;
  return detail as ContainerSummary;
}
