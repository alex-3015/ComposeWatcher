import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ContainerRow from '../ContainerRow.vue';
import { summary } from '../../__tests__/factories';

const stubs = ['ExternalLink', 'GitBranch', 'Package', 'PanelRightOpen'];

describe('ContainerRow', () => {
  it('renders a compact summary without embedding release details', () => {
    const wrapper = mount(ContainerRow, {
      props: { container: summary() },
      global: { stubs },
    });
    expect(wrapper.text()).toContain('sonarr');
    expect(wrapper.text()).toContain('4.0.0');
    expect(wrapper.text()).toContain('4.1.0');
    expect(wrapper.text()).toContain('ghcr.io/linuxserver/sonarr');
    expect(wrapper.text()).not.toContain('docker-compose.yml');
    expect(wrapper.text()).not.toContain('Improvements');
  });

  it('falls back to the package icon when an image fails', async () => {
    const wrapper = mount(ContainerRow, {
      props: { container: summary() },
      global: { stubs },
    });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.html()).toContain('package');
  });

  it('shows a reason instead of an unexplained missing release', () => {
    const wrapper = mount(ContainerRow, {
      props: {
        container: summary({
          status: 'unknown',
          comparisonMode: 'unverifiable',
          currentVersion: '${VERSION:-release}',
          latestUpstreamVersion: null,
        }),
      },
      global: { stubs },
    });
    expect(wrapper.text()).toContain('Not comparable');
    expect(wrapper.text()).toContain('Compose variable');
    expect(wrapper.text()).not.toContain('—');
  });

  it('shows a direct repository fix action when the mapping cannot be found', () => {
    const wrapper = mount(ContainerRow, {
      props: {
        container: summary({
          status: 'unknown',
          dataState: 'error',
          checkIssue: { code: 'repo-not-found', message: 'Missing', retryAt: null },
        }),
      },
      global: { stubs },
    });
    expect(wrapper.get('[aria-label="Fix repository for sonarr"]').text()).toContain(
      'Fix repository',
    );
  });

  it('emits detail and repository actions', async () => {
    const container = summary();
    const wrapper = mount(ContainerRow, { props: { container }, global: { stubs } });
    await wrapper.get('button[aria-label="Edit repository for sonarr"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Details'))!
      .trigger('click');
    expect(wrapper.emitted('linkRepo')?.[0]).toEqual([container]);
    expect(wrapper.emitted('openDetail')?.[0]).toEqual([container]);
  });
});
