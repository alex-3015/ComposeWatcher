import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ContainerCard from '../ContainerCard.vue';
import { summary } from '../../__tests__/factories';

const stubs = ['Package', 'ExternalLink', 'GitBranch', 'AlertTriangle', 'PanelRightOpen'];

describe('ContainerCard', () => {
  it('renders only summary data and uses the server-provided icon URL', () => {
    const wrapper = mount(ContainerCard, {
      props: { container: summary({ iconUrl: '/icons/custom.png' }) },
      global: { stubs },
    });
    expect(wrapper.text()).toContain('sonarr');
    expect(wrapper.text()).toContain('4.0.0');
    expect(wrapper.text()).toContain('4.1.0');
    expect(wrapper.get('img').attributes('src')).toBe('/icons/custom.png');
  });

  it('falls back to an icon when loading fails', async () => {
    const wrapper = mount(ContainerCard, {
      props: { container: summary() },
      global: { stubs },
    });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.html()).toContain('package');
  });

  it('shows freshness, diagnostics, comparison confidence, and breaking count', () => {
    const wrapper = mount(ContainerCard, {
      props: {
        container: summary({
          status: 'breaking-change',
          dataState: 'stale',
          comparisonMode: 'normalized',
          breakingChangeCount: 2,
          checkIssue: { code: 'network', message: 'Using cached data.', retryAt: null },
        }),
      },
      global: { stubs },
    });
    expect(wrapper.text()).toContain('stale data');
    expect(wrapper.text()).toContain('Normalized comparison');
    expect(wrapper.text()).toContain('2 breaking hints');
    expect(wrapper.text()).toContain('Using cached data.');
  });

  it('labels the repository action when no repository is linked', () => {
    const wrapper = mount(ContainerCard, {
      props: {
        container: summary({ status: 'no-repo', dataState: 'unlinked', githubRepo: null }),
      },
      global: { stubs },
    });
    expect(wrapper.get('[aria-label="Edit GitHub repository for sonarr"]').text()).toContain(
      'Link repository',
    );
  });

  it('emits detail and repository actions with the summary', async () => {
    const container = summary();
    const wrapper = mount(ContainerCard, { props: { container }, global: { stubs } });
    await wrapper.get('button').trigger('click');
    await wrapper.get('[aria-label="Edit GitHub repository for sonarr"]').trigger('click');
    expect(wrapper.emitted('openDetail')?.[0]).toEqual([container]);
    expect(wrapper.emitted('linkRepo')?.[0]).toEqual([container]);
  });
});
