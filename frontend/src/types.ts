export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  currentVersion: string;
  composeFile: string;
  githubRepo: string | null;
  latestVersion: string | null;
  publishedAt: string | null;
  status: 'up-to-date' | 'update-available' | 'breaking-change' | 'unknown' | 'no-repo';
  breakingChangeReason: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  releaseName: string | null;
  lastChecked: string | null;
}
