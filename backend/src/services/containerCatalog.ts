import type { GithubRateLimit, RefreshMeta } from '@composewatcher/contracts';
import type { ContainerInfo } from '../types.js';
import { toContainerDetail, toContainerSummary } from '../domain/containerProjection.js';
import type { EnrichmentResult } from './githubService.js';
import { consoleServiceLogger, type ServiceLogger } from './serviceLogger.js';
import {
  applyRepositoryMappings,
  BACKGROUND_RETRY_MS,
  defaultCatalogDependencies,
  DEFAULT_CACHE_TTL_MS,
  idleRefreshMeta,
  mergeCatalogSnapshot,
  positiveInteger,
  resetContainerEnrichment,
  type ContainerCatalogDependencies,
  type ContainerCatalogApi,
  ContainerNotFoundError,
  type RefreshTask,
} from './containerCatalogSupport.js';

export type {
  ContainerCatalogApi,
  ContainerCatalogDependencies,
} from './containerCatalogSupport.js';
export { ContainerNotFoundError } from './containerCatalogSupport.js';

/** Owns the local catalog, cache snapshot, and all asynchronous refresh coordination. */
export class ContainerCatalog implements ContainerCatalogApi {
  private containers: ContainerInfo[] = [];
  private refreshedAt: string | null = null;
  private githubRateLimit: GithubRateLimit | null = null;
  private availableIcons = new Set<string>();
  private revision = 0;
  private stopped = false;
  private globalTask: RefreshTask | null = null;
  private readonly targetedTasks = new Map<string, RefreshTask>();
  private readonly pendingCounts = new Map<string, number>();
  private lastMeta = idleRefreshMeta();
  private lastRefreshAttemptAt = 0;
  private readonly cacheTtlMs: number;

  constructor(
    private readonly logger: ServiceLogger = consoleServiceLogger,
    private readonly dependencies: ContainerCatalogDependencies = defaultCatalogDependencies,
    cacheTtlMs = positiveInteger(process.env.CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
  ) {
    this.cacheTtlMs = cacheTtlMs;
  }

  async initialize(refreshOnStart = true): Promise<void> {
    const [config, scanned, snapshot, availableIcons] = await Promise.all([
      this.dependencies.loadConfig(this.logger),
      this.dependencies.scan(this.logger),
      this.dependencies.loadSnapshot(this.logger),
      this.dependencies.listIcons(),
    ]);
    this.availableIcons = availableIcons;
    const mapped = applyRepositoryMappings(scanned, config);
    this.containers = snapshot ? mergeCatalogSnapshot(mapped, snapshot.containers) : mapped;
    if (snapshot) {
      this.refreshedAt = snapshot.refreshedAt;
      this.githubRateLimit = snapshot.githubRateLimit;
    }
    if (refreshOnStart) this.startGlobalRefresh();
  }

  list() {
    if (this.shouldRevalidate()) this.startGlobalRefresh();
    return {
      data: this.containers.map((container) =>
        toContainerSummary(container, this.isPending(container.id), this.availableIcons),
      ),
      meta: {
        refresh: this.refreshMeta(),
        refreshedAt: this.refreshedAt,
        githubRateLimit: this.githubRateLimit,
      },
    };
  }

  detail(containerId: string) {
    const container = this.find(containerId);
    return toContainerDetail(container, this.isPending(container.id), this.availableIcons);
  }

  startGlobalRefresh(): RefreshMeta {
    if (this.globalTask) return this.refreshMeta();
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const revision = this.revision;
    this.lastRefreshAttemptAt = Date.now();
    const task: RefreshTask = {
      controller,
      startedAt,
      promise: this.runGlobalRefresh(revision, controller.signal)
        .then(() => this.finishSuccess('all', null, startedAt))
        .catch((error: unknown) => this.finishFailure('all', null, startedAt, error))
        .finally(() => {
          if (this.globalTask === task) this.globalTask = null;
        }),
    };
    this.globalTask = task;
    return this.refreshMeta();
  }

  async updateRepository(containerId: string, repo: string | null) {
    const existing = this.find(containerId);
    await this.dependencies.setRepoMapping(containerId, repo, this.logger);
    this.revision += 1;
    this.globalTask?.controller.abort();
    const updated = resetContainerEnrichment(existing, repo);
    this.replace(updated);
    const previous = this.targetedTasks.get(updated.id);
    if (previous) {
      this.targetedTasks.delete(updated.id);
      previous.controller.abort();
    }
    if (repo) {
      this.startTargetedRefresh(updated);
    } else await this.persistSnapshot();
    return {
      data: toContainerSummary(updated, Boolean(repo), this.availableIcons),
      meta: { refresh: this.refreshMeta() },
    };
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.globalTask?.controller.abort();
    for (const task of this.targetedTasks.values()) task.controller.abort();
    const tasks = [
      ...(this.globalTask ? [this.globalTask.promise] : []),
      ...[...this.targetedTasks.values()].map((task) => task.promise),
    ];
    await Promise.allSettled(tasks);
  }

  private find(containerId: string): ContainerInfo {
    const container = this.containers.find((candidate) => candidate.id === containerId);
    if (!container) throw new ContainerNotFoundError(containerId);
    return container;
  }

  private replace(container: ContainerInfo): void {
    this.containers = this.containers.map((candidate) =>
      candidate.id === container.id ? container : candidate,
    );
  }

  private shouldRevalidate(): boolean {
    if (this.stopped || this.globalTask) return false;
    const refreshed = this.refreshedAt ? new Date(this.refreshedAt).getTime() : 0;
    const stale = Date.now() - refreshed >= this.cacheTtlMs;
    const retryDue = Date.now() - this.lastRefreshAttemptAt >= BACKGROUND_RETRY_MS;
    return stale && retryDue;
  }

  private refreshMeta(): RefreshMeta {
    if (this.globalTask) {
      return {
        state: 'running',
        scope: 'all',
        containerId: null,
        startedAt: this.globalTask.startedAt,
        finishedAt: null,
        error: null,
      };
    }
    const targeted = this.targetedTasks.entries().next();
    if (!targeted.done) {
      const [containerId, task] = targeted.value;
      return {
        state: 'running',
        scope: 'container',
        containerId,
        startedAt: task.startedAt,
        finishedAt: null,
        error: null,
      };
    }
    return { ...this.lastMeta };
  }

  private async runGlobalRefresh(revision: number, signal: AbortSignal): Promise<void> {
    const config = await this.dependencies.loadConfig(this.logger);
    const scanned = applyRepositoryMappings(await this.dependencies.scan(this.logger), config);
    this.markPending(
      scanned.map((container) => container.id),
      1,
    );
    try {
      const enrichment = await this.dependencies.enrich(scanned, this.logger, signal, true);
      if (this.stopped || revision !== this.revision) return;
      await this.commit(enrichment);
    } finally {
      this.markPending(
        scanned.map((container) => container.id),
        -1,
      );
    }
  }

  private startTargetedRefresh(container: ContainerInfo): void {
    if (this.targetedTasks.has(container.id)) return;
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const revision = this.revision;
    this.markPending([container.id], 1);
    const task: RefreshTask = {
      controller,
      startedAt,
      promise: this.dependencies
        .enrich([container], this.logger, controller.signal)
        .then(async (result) => {
          if (this.stopped || revision !== this.revision) return;
          const enriched = result.containers[0];
          if (enriched && this.find(container.id).githubRepo === enriched.githubRepo) {
            this.replace(enriched);
            this.githubRateLimit = result.githubRateLimit;
            await this.persistSnapshot();
            this.startIconDownload([enriched]);
          }
          this.finishSuccess('container', container.id, startedAt);
        })
        .catch((error: unknown) => this.finishFailure('container', container.id, startedAt, error))
        .finally(() => {
          this.markPending([container.id], -1);
          if (this.targetedTasks.get(container.id) === task) {
            this.targetedTasks.delete(container.id);
          }
        }),
    };
    this.targetedTasks.set(container.id, task);
  }

  private async commit(enrichment: EnrichmentResult): Promise<void> {
    this.containers = enrichment.containers;
    this.githubRateLimit = enrichment.githubRateLimit;
    this.refreshedAt = new Date().toISOString();
    await this.persistSnapshot();
    this.startIconDownload(this.containers);
  }

  private startIconDownload(containers: ContainerInfo[]): void {
    void this.dependencies
      .downloadIcons(containers)
      .then((fileNames) => {
        for (const fileName of fileNames) this.availableIcons.add(fileName);
      })
      .catch((error: unknown) => {
        this.logger.warn({ error }, 'Icon download failed');
      });
  }

  private async persistSnapshot(): Promise<void> {
    try {
      await this.dependencies.saveSnapshot(this.containers, this.githubRateLimit, this.refreshedAt);
    } catch (error) {
      this.logger.warn({ error }, 'Failed to persist container snapshot');
    }
  }

  private finishSuccess(
    scope: Exclude<RefreshMeta['scope'], null>,
    containerId: string | null,
    startedAt: string,
  ): void {
    this.lastMeta = {
      state: 'idle',
      scope,
      containerId,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: null,
    };
  }

  private finishFailure(
    scope: Exclude<RefreshMeta['scope'], null>,
    containerId: string | null,
    startedAt: string,
    error: unknown,
  ): void {
    if (error instanceof Error && error.name === 'AbortError') return;
    this.logger.error({ error }, 'Container refresh failed');
    this.lastMeta = {
      state: 'failed',
      scope,
      containerId,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: { code: 'REFRESH_FAILED', message: 'Container refresh failed.' },
    };
  }

  private markPending(containerIds: string[], delta: 1 | -1): void {
    for (const containerId of containerIds) {
      const count = (this.pendingCounts.get(containerId) ?? 0) + delta;
      if (count > 0) this.pendingCounts.set(containerId, count);
      else this.pendingCounts.delete(containerId);
    }
  }

  private isPending(containerId: string): boolean {
    return (this.pendingCounts.get(containerId) ?? 0) > 0;
  }
}
