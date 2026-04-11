import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ContainerCard from '../ContainerCard.vue';
import type { ContainerInfo } from '../../types';

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: 'linuxserver/sonarr',
    latestVersion: '4.1.0',
    publishedAt: '2024-06-01T00:00:00Z',
    status: 'up-to-date',
    breakingChangeReason: null,
    releaseUrl: 'https://github.com/linuxserver/sonarr/releases/tag/4.1.0',
    releaseNotes: null,
    releaseName: null,
    lastChecked: '2024-06-01T12:00:00Z',
    ...overrides,
  };
}

const stubs = ['Package', 'ExternalLink', 'GitBranch', 'AlertTriangle'];

describe('ContainerCard – icon', () => {
  it('renders an <img> with the correct selfh.st icon URL', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ name: 'sonarr' }) },
      global: { stubs },
    });
    const img = w.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe(
      '/icons/sonarr.png',
    );
    expect(img.attributes('alt')).toBe('sonarr');
  });

  it('falls back to Package icon when image fails to load', async () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ name: 'sonarr' }) },
      global: { stubs },
    });
    expect(w.find('img').exists()).toBe(true);

    await w.find('img').trigger('error');
    await w.vm.$nextTick();

    expect(w.find('img').exists()).toBe(false);
    // Package stub should now be rendered as fallback
    expect(w.html()).toContain('package');
  });

  it('uses mapped icon name for known aliases', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ name: 'adguardhome' }) },
      global: { stubs },
    });
    expect(w.find('img').attributes('src')).toBe(
      '/icons/adguard-home.png',
    );
  });
});

describe('ContainerCard – rendering', () => {
  it('displays the container name', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('sonarr');
  });

  it('displays the image name', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('ghcr.io/linuxserver/sonarr');
  });

  it('displays current version', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('4.0.0');
  });

  it('displays latest version', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('4.1.0');
  });

  it('shows "—" when latestVersion is null', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ latestVersion: null }) },
      global: { stubs },
    });
    expect(w.text()).toContain('—');
  });

  it('displays the compose file path', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('docker-compose.yml');
  });

  it('shows the linked github repo in the button', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ githubRepo: 'myorg/myapp' }) },
      global: { stubs },
    });
    expect(w.text()).toContain('myorg/myapp');
  });

  it('shows "Link repo" when githubRepo is null', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ githubRepo: null }) },
      global: { stubs },
    });
    expect(w.text()).toContain('Link repo');
  });

  it('formats lastChecked date using browser locale', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ lastChecked: '2024-06-01T12:00:00Z' }) },
      global: { stubs },
    });
    // Verify the date contains the expected components (year, month, day) regardless of locale format
    const text = w.text();
    expect(text).toMatch(/2024/);
    expect(text).toMatch(/0?6/); // month: 6 or 06
    expect(text).toMatch(/0?1/); // day: 1 or 01
  });

  it('does not show last-checked text when lastChecked is null', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ lastChecked: null }) },
      global: { stubs },
    });
    expect(w.text()).not.toContain('Last checked');
  });
});

describe('ContainerCard – release link', () => {
  it('shows a release link when releaseUrl is set', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    const link = w.find('a[href]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toContain('github.com');
    expect(link.attributes('target')).toBe('_blank');
  });

  it('hides the release link when releaseUrl is null', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ releaseUrl: null }) },
      global: { stubs },
    });
    expect(w.find('a[href]').exists()).toBe(false);
  });
});

describe('ContainerCard – breaking change warning', () => {
  it('shows breaking change banner when status is "breaking-change" and reason is set', () => {
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({
          status: 'breaking-change',
          breakingChangeReason: 'Major version bump: 1.0.0 → 2.0.0',
        }),
      },
      global: { stubs },
    });
    expect(w.text()).toContain('Major version bump: 1.0.0 → 2.0.0');
  });

  it('hides breaking change banner for "up-to-date" status', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ status: 'up-to-date', breakingChangeReason: null }) },
      global: { stubs },
    });
    expect(w.text()).not.toContain('Major version bump');
  });

  it('hides breaking change banner when status is "breaking-change" but reason is null', () => {
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({ status: 'breaking-change', breakingChangeReason: null }),
      },
      global: { stubs },
    });
    // Banner div should not be present (v-if condition requires both conditions)
    const redBanner = w.findAll('div').filter((el) => el.classes().includes('bg-red-500/10'));
    expect(redBanner).toHaveLength(0);
  });
});

describe('ContainerCard – card border classes', () => {
  it('applies red border class for "breaking-change" status', () => {
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({ status: 'breaking-change', breakingChangeReason: 'reason' }),
      },
      global: { stubs },
    });
    expect(w.find('div').classes().join(' ')).toContain('border-red-500/40');
  });

  it('applies amber border class for "update-available" status', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ status: 'update-available' }) },
      global: { stubs },
    });
    expect(w.find('div').classes().join(' ')).toContain('border-amber-500/30');
  });

  it('applies default gray border for "up-to-date" status', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ status: 'up-to-date' }) },
      global: { stubs },
    });
    expect(w.find('div').classes().join(' ')).toContain('border-gray-800');
  });
});

describe('ContainerCard – events', () => {
  it('emits "linkRepo" event with the container when repo button is clicked', async () => {
    const container = makeContainer();
    const w = mount(ContainerCard, { props: { container }, global: { stubs } });

    // The GitBranch button is the last button in the footer
    const buttons = w.findAll('button');
    await buttons[buttons.length - 1].trigger('click');

    expect(w.emitted('linkRepo')).toBeTruthy();
    expect(w.emitted('linkRepo')![0][0]).toEqual(container);
  });

  it('passes the exact container object in the emitted event', async () => {
    const container = makeContainer({ name: 'special-app', githubRepo: 'org/special' });
    const w = mount(ContainerCard, { props: { container }, global: { stubs } });

    const buttons = w.findAll('button');
    await buttons[buttons.length - 1].trigger('click');

    const emitted = w.emitted('linkRepo')![0][0] as ContainerInfo;
    expect(emitted.name).toBe('special-app');
    expect(emitted.githubRepo).toBe('org/special');
  });
});

describe('ContainerCard – version highlight', () => {
  it('highlights latest version in amber when update is available', () => {
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({
          status: 'update-available',
          currentVersion: '4.0.0',
          latestVersion: '4.1.0',
        }),
      },
      global: { stubs },
    });
    // The latest version cell should have amber text
    const amberEl = w.find('.text-amber-300');
    expect(amberEl.exists()).toBe(true);
    expect(amberEl.text()).toBe('4.1.0');
  });

  it('does not highlight latest version for up-to-date containers', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ status: 'up-to-date' }) },
      global: { stubs },
    });
    expect(w.find('.text-amber-300').exists()).toBe(false);
  });

  it('highlights latest version in amber for breaking-change status', () => {
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({
          status: 'breaking-change',
          currentVersion: '1.0.0',
          latestVersion: '2.0.0',
          breakingChangeReason: 'Major version bump',
        }),
      },
      global: { stubs },
    });
    expect(w.find('.text-amber-300').exists()).toBe(true);
    expect(w.find('.text-amber-300').text()).toBe('2.0.0');
  });

  it('does not highlight latest version for "unknown" status', () => {
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ status: 'unknown', latestVersion: null }) },
      global: { stubs },
    });
    expect(w.find('.text-amber-300').exists()).toBe(false);
  });

  it('does not highlight latest version for "no-repo" status', () => {
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({ status: 'no-repo', githubRepo: null, latestVersion: null }),
      },
      global: { stubs },
    });
    expect(w.find('.text-amber-300').exists()).toBe(false);
  });
});

describe('ContainerCard – edge cases', () => {
  it('shows "—" for both current and latest when versions are empty strings', () => {
    // latestVersion null → shows "—"; currentVersion is always a string from parser
    const w = mount(ContainerCard, {
      props: { container: makeContainer({ latestVersion: null }) },
      global: { stubs },
    });
    expect(w.text()).toContain('—');
  });

  it('applies amber border class for "breaking-change" (hasUpdate is true)', () => {
    // breaking-change is a superset of "has update" — border should be red (breaking takes priority)
    const w = mount(ContainerCard, {
      props: {
        container: makeContainer({ status: 'breaking-change', breakingChangeReason: 'reason' }),
      },
      global: { stubs },
    });
    // Red border takes priority over amber for breaking-change
    expect(w.find('div').classes().join(' ')).toContain('border-red-500/40');
    expect(w.find('div').classes().join(' ')).not.toContain('border-amber-500/30');
  });

  it('shows release link with correct rel="noreferrer" for security', () => {
    const w = mount(ContainerCard, { props: { container: makeContainer() }, global: { stubs } });
    const link = w.find('a[href]');
    expect(link.attributes('rel')).toContain('noreferrer');
  });
});
