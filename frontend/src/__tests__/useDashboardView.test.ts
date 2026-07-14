import { nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDashboardView } from '../composables/useDashboardView';
import { summary } from './factories';

beforeEach(() => localStorage.clear());

describe('useDashboardView', () => {
  const containers = () =>
    ref([
      summary({ id: 'a', name: 'breaking', status: 'breaking-change', breakingChangeCount: 1 }),
      summary({ id: 'b', name: 'update', status: 'update-available', githubRepo: 'org/search-me' }),
      summary({
        id: 'c',
        name: 'stale',
        status: 'unknown',
        dataState: 'stale',
        composeFile: 'infra/compose.yml',
      }),
      summary({
        id: 'd',
        name: 'missing',
        status: 'no-repo',
        dataState: 'unlinked',
        githubRepo: null,
      }),
      summary({
        id: 'e',
        name: 'rolling',
        status: 'unknown',
        dataState: 'fresh',
        currentVersion: 'latest',
        comparisonMode: 'unverifiable',
        latestUpstreamVersion: null,
      }),
      summary({ id: 'f', name: 'current', status: 'ahead', image: 'custom/image:1' }),
    ]);

  it('implements the seven action filters', () => {
    const view = useDashboardView(containers());
    expect(view.counts.value).toEqual({
      all: 6,
      breaking: 1,
      updates: 1,
      'check-failed': 1,
      'repository-missing': 1,
      'not-comparable': 1,
      current: 1,
    });
    view.filter.value = 'check-failed';
    expect(view.filtered.value.map((item) => item.name)).toEqual(['stale']);
  });

  it.each([
    ['all', ['breaking', 'update', 'stale', 'missing', 'rolling', 'current']],
    ['breaking', ['breaking']],
    ['updates', ['update']],
    ['check-failed', ['stale']],
    ['repository-missing', ['missing']],
    ['not-comparable', ['rolling']],
    ['current', ['current']],
  ] as const)('applies the %s filter', (filter, expected) => {
    const view = useDashboardView(containers());
    view.filter.value = filter;
    expect(view.filtered.value.map((item) => item.name).sort()).toEqual([...expected].sort());
  });

  it('keeps pending checks out of failure filters', () => {
    const view = useDashboardView(
      ref([
        summary({ id: 'a', name: 'pending', status: 'unknown', dataState: 'pending' }),
        summary({ id: 'b', name: 'unknown', status: 'unknown', dataState: 'fresh' }),
      ]),
    );
    view.filter.value = 'check-failed';
    expect(view.filtered.value.map((item) => item.name)).toEqual(['unknown']);
  });

  it.each([
    ['search-me', 'update'],
    ['infra', 'stale'],
    ['custom/image', 'current'],
    ['BREAKING', 'breaking'],
  ])('searches repository, Compose file, image, and name: %s', (query, expected) => {
    const view = useDashboardView(containers());
    view.searchQuery.value = query;
    expect(view.filtered.value.map((item) => item.name)).toEqual([expected]);
  });

  it.each([
    ['name', ['alpha', 'zeta']],
    ['compose', ['alpha', 'zeta']],
    ['published', ['zeta', 'alpha']],
  ] as const)('sorts summaries by %s', (sortMode, expected) => {
    const view = useDashboardView(
      ref([
        summary({
          id: 'z',
          name: 'zeta',
          composeFile: 'b.yml',
          publishedAt: '2026-02-01T00:00:00.000Z',
        }),
        summary({ id: 'a', name: 'alpha', composeFile: 'a.yml', publishedAt: 'invalid' }),
      ]),
    );
    view.sortMode.value = sortMode;
    expect(view.filtered.value.map((item) => item.name)).toEqual(expected);
  });

  it('sorts ties by name and groups urgent Compose files first', () => {
    const view = useDashboardView(
      ref([
        summary({
          id: 'b',
          name: 'beta',
          composeFile: 'same.yml',
          publishedAt: null,
          status: 'up-to-date',
        }),
        summary({
          id: 'a',
          name: 'alpha',
          composeFile: 'same.yml',
          publishedAt: null,
          status: 'up-to-date',
        }),
        summary({
          id: 'c',
          name: 'urgent',
          composeFile: 'urgent.yml',
          publishedAt: null,
          status: 'breaking-change',
        }),
      ]),
    );
    expect(view.grouped.value.map((group) => group.composeFile)).toEqual([
      'urgent.yml',
      'same.yml',
    ]);
    expect(view.grouped.value[1].containers.map((item) => item.name)).toEqual(['alpha', 'beta']);
    view.sortMode.value = 'published';
    expect(view.filtered.value.slice(0, 2).map((item) => item.name)).toEqual(['alpha', 'beta']);
  });

  it('persists layout preferences and tolerates broken storage', async () => {
    const view = useDashboardView(containers());
    view.viewMode.value = 'compact';
    view.toggleGroup('infra/compose.yml');
    await nextTick();
    expect(localStorage.getItem('compose-watcher:dashboard:v3')).toContain('compact');
    localStorage.setItem('compose-watcher:dashboard:v3', '{broken');
    view.loadPreferences();
    expect(localStorage.getItem('compose-watcher:dashboard:v3')).toBeNull();
  });

  it('loads valid preferences, filters invalid collapsed values, and expands groups again', () => {
    localStorage.setItem(
      'compose-watcher:dashboard:v3',
      JSON.stringify({
        filter: 'updates',
        sortMode: 'compose',
        viewMode: 'compact',
        collapsedGroups: ['a.yml', 42],
      }),
    );
    const view = useDashboardView(containers());
    view.loadPreferences();
    expect(view.filter.value).toBe('updates');
    expect(view.sortMode.value).toBe('compose');
    expect(view.viewMode.value).toBe('compact');
    expect([...view.collapsedGroups.value]).toEqual(['a.yml']);
    view.toggleGroup('a.yml');
    expect(view.collapsedGroups.value.has('a.yml')).toBe(false);
  });

  it('expands and collapses a selected set of groups', () => {
    const view = useDashboardView(containers());
    view.toggleGroup('unrelated.yml');
    view.setGroupsExpanded(['a.yml', 'b.yml'], false);
    expect([...view.collapsedGroups.value]).toEqual(['unrelated.yml', 'a.yml', 'b.yml']);
    view.setGroupsExpanded(['a.yml', 'b.yml'], true);
    expect([...view.collapsedGroups.value]).toEqual(['unrelated.yml']);
  });
});
