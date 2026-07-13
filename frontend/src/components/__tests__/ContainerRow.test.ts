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
    expect(wrapper.text()).not.toContain('Improvements');
  });

  it('emits detail and repository actions', async () => {
    const container = summary();
    const wrapper = mount(ContainerRow, { props: { container }, global: { stubs } });
    await wrapper.get('button[aria-label="Edit GitHub repository for sonarr"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Details'))!
      .trigger('click');
    expect(wrapper.emitted('linkRepo')?.[0]).toEqual([container]);
    expect(wrapper.emitted('openDetail')?.[0]).toEqual([container]);
  });
});
