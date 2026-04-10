import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ComposeGroup from '../ComposeGroup.vue';
import type { ContainerInfo } from '../../types';

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestVersion: '4.0.0',
    publishedAt: '2024-01-01T00:00:00Z',
    status: 'up-to-date',
    breakingChangeReason: null,
    releaseUrl: 'https://github.com/linuxserver/sonarr/releases/tag/4.0.0',
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const stubs = [
  'ChevronDown',
  'FolderOpen',
  'Package',
  'ExternalLink',
  'GitBranch',
  'AlertTriangle',
];

const defaultProps = {
  composeFile: 'media/docker-compose.yml',
  containers: [
    makeContainer({ id: 'a', name: 'sonarr' }),
    makeContainer({ id: 'b', name: 'radarr' }),
  ],
  counts: { breaking: 0, updates: 0, total: 2 },
  expanded: true,
};

describe('ComposeGroup – rendering', () => {
  it('displays the compose file path', () => {
    const w = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    expect(w.text()).toContain('media/docker-compose.yml');
  });

  it('displays the total container count', () => {
    const w = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    expect(w.text()).toContain('2 containers');
  });

  it('displays breaking count when > 0', () => {
    const w = mount(ComposeGroup, {
      props: { ...defaultProps, counts: { breaking: 1, updates: 0, total: 2 } },
      global: { stubs },
    });
    expect(w.text()).toContain('1 breaking');
  });

  it('displays update count when > 0', () => {
    const w = mount(ComposeGroup, {
      props: { ...defaultProps, counts: { breaking: 0, updates: 2, total: 3 } },
      global: { stubs },
    });
    expect(w.text()).toContain('2 updates');
  });

  it('hides breaking badge when count is 0', () => {
    const w = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    expect(w.text()).not.toContain('breaking');
  });

  it('hides update badge when count is 0', () => {
    const w = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    expect(w.text()).not.toContain('update');
  });

  it('uses singular "container" for count of 1', () => {
    const w = mount(ComposeGroup, {
      props: {
        ...defaultProps,
        containers: [makeContainer()],
        counts: { breaking: 0, updates: 0, total: 1 },
      },
      global: { stubs },
    });
    // Check the group header button text specifically for singular
    const headerBtn = w
      .findAll('button')
      .find((b) => b.text().includes('media/docker-compose.yml'));
    expect(headerBtn!.text()).toContain('1 container');
    expect(headerBtn!.text()).not.toContain('1 containers');
  });
});

describe('ComposeGroup – toggle', () => {
  it('emits "toggle" when header button is clicked', async () => {
    const w = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    const headerBtn = w
      .findAll('button')
      .find((b) => b.text().includes('media/docker-compose.yml'));
    await headerBtn!.trigger('click');
    expect(w.emitted('toggle')).toBeTruthy();
  });

  it('shows containers when expanded is true', () => {
    const w = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    expect(w.text()).toContain('sonarr');
    expect(w.text()).toContain('radarr');
  });
});

describe('ComposeGroup – linkRepo forwarding', () => {
  it('emits "linkRepo" when a ContainerCard emits it', async () => {
    const w = mount(ComposeGroup, {
      props: {
        ...defaultProps,
        containers: [makeContainer({ githubRepo: null, status: 'no-repo' })],
        counts: { breaking: 0, updates: 0, total: 1 },
      },
      global: { stubs },
    });

    const linkBtn = w.findAll('button').find((b) => b.text().includes('Link repo'));
    await linkBtn!.trigger('click');

    expect(w.emitted('linkRepo')).toBeTruthy();
  });
});
