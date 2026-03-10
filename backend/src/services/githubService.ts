import semver from 'semver';
import type { ContainerInfo, GithubRelease } from '../types.js';

const BREAKING_KEYWORDS = [
  'breaking change',
  'breaking-change',
  'breaking_change',
  'incompatible',
  'migration required',
  'manual intervention',
  'nicht abwärtskompatibel',
];

const FETCH_TIMEOUT_MS = 10_000;

function getGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ContainerUpdateChecker/1.0',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchLatestRelease(owner: string, repo: string): Promise<GithubRelease | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers: getGithubHeaders(), signal: controller.signal });

    if (res.status === 404) return null;
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${msg}`);
    }

    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')), { once: true }
      );
    });
    return await Promise.race([res.json() as Promise<GithubRelease>, abortPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeVersion(v: string): string {
  return v.replace(/^v/, '');
}

function detectBreakingChange(release: GithubRelease, currentVersion: string, latestVersion: string): string | null {
  const current = semver.parse(normalizeVersion(currentVersion));
  const latest = semver.parse(normalizeVersion(latestVersion));

  if (current && latest && latest.major > current.major) {
    return `Major version bump: ${currentVersion} → ${latestVersion}`;
  }

  const body = (release.body ?? '').toLowerCase();
  const title = (release.name ?? '').toLowerCase();

  for (const kw of BREAKING_KEYWORDS) {
    if (body.includes(kw) || title.includes(kw)) {
      return `Release notes mention: "${kw}"`;
    }
  }

  return null;
}

function compareVersions(current: string, latest: string): 'up-to-date' | 'update-available' {
  const c = semver.parse(normalizeVersion(current));
  const l = semver.parse(normalizeVersion(latest));

  if (c && l) {
    return semver.lt(c, l) ? 'update-available' : 'up-to-date';
  }

  return current === latest ? 'up-to-date' : 'update-available';
}

export async function enrichWithGithubData(
  containers: ContainerInfo[]
): Promise<ContainerInfo[]> {
  const results: ContainerInfo[] = [];

  for (const container of containers) {
    if (!container.githubRepo) {
      results.push({ ...container, status: 'no-repo' });
      continue;
    }

    try {
      const [owner, repo] = container.githubRepo.split('/');
      const release = await fetchLatestRelease(owner, repo);

      if (!release) {
        results.push({ ...container, status: 'unknown', lastChecked: new Date().toISOString() });
        continue;
      }

      const latestVersion = release.tag_name;
      const baseStatus = compareVersions(container.currentVersion, latestVersion);
      const breakingChangeReason =
        baseStatus === 'update-available'
          ? detectBreakingChange(release, container.currentVersion, latestVersion)
          : null;

      results.push({
        ...container,
        latestVersion,
        publishedAt: release.published_at,
        status: breakingChangeReason ? 'breaking-change' : baseStatus,
        breakingChangeReason,
        releaseUrl: release.html_url,
        lastChecked: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`Failed to fetch GitHub data for ${container.githubRepo}:`, err);
      results.push({ ...container, status: 'unknown', lastChecked: new Date().toISOString() });
    }
  }

  return results;
}
