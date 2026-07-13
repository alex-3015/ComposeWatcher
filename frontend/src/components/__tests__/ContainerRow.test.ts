import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ContainerRow from '../ContainerRow.vue';
import type { ContainerInfo } from '../../types';

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::app',
    name: 'app',
    image: 'ghcr.io/example/app',
    currentVersion: '1.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'example/app',
    latestUpstreamVersion: '2.0.0',
    publishedAt: '2026-07-13T12:00:00.000Z',
    status: 'breaking-change',
    updateKind: 'major',
    comparisonMode: 'exact',
    historyComplete: false,
    releaseDataStale: false,
    checkIssue: { code: 'network', message: 'Using cached data.', retryAt: null },
    breakingChanges: [
      {
        version: '2.0.0',
        releaseName: '2.0.0',
        reason: 'Major version bump',
        releaseUrl: 'https://github.com/example/app/releases/tag/2.0.0',
      },
    ],
    releaseUrl: 'https://github.com/example/app/releases/tag/2.0.0',
    releaseNotes: '## Changes',
    releaseName: '2.0.0',
    lastChecked: '2026-07-13T12:00:00.000Z',
    ...overrides,
  };
}

const stubs = ['ChevronDown', 'ExternalLink', 'GitBranch', 'Package'];

describe('ContainerRow', () => {
  it('renders a compact summary and keeps details collapsed initially', () => {
    const wrapper = mount(ContainerRow, {
      props: { container: makeContainer() },
      global: { stubs },
    });

    expect(wrapper.text()).toContain('app');
    expect(wrapper.text()).toContain('1.0.0');
    expect(wrapper.text()).toContain('2.0.0');
    expect(
      wrapper.get('button[aria-label="Show details for app"]').attributes('aria-expanded'),
    ).toBe('false');
    expect(wrapper.text()).not.toContain('Using cached data.');
  });

  it('shows diagnostics, breaking changes, release actions, and timestamps when expanded', async () => {
    const wrapper = mount(ContainerRow, {
      props: { container: makeContainer() },
      global: { stubs },
    });

    await wrapper.get('button[aria-label="Show details for app"]').trigger('click');

    expect(wrapper.text()).toContain('Major version bump');
    expect(wrapper.text()).toContain('Using cached data.');
    expect(wrapper.text()).toContain('Breaking-change history may be incomplete.');
    expect(wrapper.text()).toContain('Checked');
    expect(wrapper.find('[title]').attributes('title')).toBeTruthy();
    expect(wrapper.findAll('a').some((link) => link.text().includes('Release'))).toBe(true);
    expect(
      wrapper.get('button[aria-label="Hide details for app"]').attributes('aria-expanded'),
    ).toBe('true');
  });

  it('emits linkRepo and uses the fallback label for unlinked containers', async () => {
    const container = makeContainer({
      githubRepo: null,
      releaseUrl: null,
      latestUpstreamVersion: null,
      lastChecked: null,
      historyComplete: true,
      checkIssue: null,
      breakingChanges: [],
      releaseNotes: null,
    });
    const wrapper = mount(ContainerRow, {
      props: { container },
      global: { stubs },
    });
    await wrapper.get('button[aria-label="Show details for app"]').trigger('click');

    const linkButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Link repo'))!;
    await linkButton.trigger('click');

    expect(wrapper.text()).toContain('—');
    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('Checked');
    expect(wrapper.emitted('linkRepo')?.[0]).toEqual([container]);
  });

  it('collapses details on a second toggle', async () => {
    const wrapper = mount(ContainerRow, {
      props: { container: makeContainer() },
      global: { stubs },
    });
    await wrapper.get('button[aria-label="Show details for app"]').trigger('click');
    await wrapper.get('button[aria-label="Hide details for app"]').trigger('click');

    expect(wrapper.find('button[aria-label="Show details for app"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Using cached data.');
  });
});
