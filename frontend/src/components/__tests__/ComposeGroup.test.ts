import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ComposeGroup from '../ComposeGroup.vue';
import { summary } from '../../__tests__/factories';

const stubs = [
  'ChevronDown',
  'FolderOpen',
  'Package',
  'ExternalLink',
  'GitBranch',
  'AlertTriangle',
  'PanelRightOpen',
];
const containers = [summary({ id: 'a', name: 'sonarr' }), summary({ id: 'b', name: 'radarr' })];
const defaultProps = {
  composeFile: 'media/docker-compose.yml',
  containers,
  counts: { breaking: 1, updates: 1, total: 2 },
  expanded: true,
  viewMode: 'cards' as const,
};

describe('ComposeGroup', () => {
  it('renders group counts and toggles the group', async () => {
    const wrapper = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    expect(wrapper.text()).toContain('media/docker-compose.yml');
    expect(wrapper.text()).toContain('1 breaking');
    expect(wrapper.text()).toContain('1 update');
    expect(wrapper.text()).toContain('2 containers');
    await wrapper.get('button[aria-controls]').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });

  it('does not render containers while collapsed', () => {
    const wrapper = mount(ComposeGroup, {
      props: { ...defaultProps, expanded: false },
      global: { stubs },
    });
    expect(wrapper.text()).not.toContain('sonarr');
  });

  it('renders cards and compact rows and forwards their actions', async () => {
    const cards = mount(ComposeGroup, { props: defaultProps, global: { stubs } });
    await cards
      .findAll('button')
      .find((button) => button.text().includes('View details'))!
      .trigger('click');
    expect(cards.emitted('openDetail')?.[0]).toEqual([containers[0]]);

    const compact = mount(ComposeGroup, {
      props: { ...defaultProps, viewMode: 'compact' },
      global: { stubs },
    });
    await compact.get('[aria-label="Edit GitHub repository for sonarr"]').trigger('click');
    expect(compact.emitted('linkRepo')?.[0]).toEqual([containers[0]]);
  });
});
