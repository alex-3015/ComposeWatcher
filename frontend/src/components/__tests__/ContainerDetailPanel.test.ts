import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ContainerDetailPanel from '../ContainerDetailPanel.vue';
import { detail, summary } from '../../__tests__/factories';

const stubs = ['X', 'ExternalLink', 'GitBranch', 'AlertTriangle', 'LoaderCircle'];

describe('ContainerDetailPanel', () => {
  it('exposes dialog semantics and renders lazy detail fields', async () => {
    const wrapper = mount(ContainerDetailPanel, {
      props: { container: summary(), detail: detail(), loading: false, error: null },
      global: { stubs },
    });
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sonarr 4.1.0'));
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Sonarr 4.1.0'))!
      .trigger('click');
    expect(wrapper.text()).toContain('Improvements');
  });

  it('shows loading and retryable errors', async () => {
    const loading = mount(ContainerDetailPanel, {
      props: { container: summary(), detail: null, loading: true, error: null },
      global: { stubs },
    });
    expect(loading.get('[role="status"]').text()).toContain('Loading release details');

    const failed = mount(ContainerDetailPanel, {
      props: { container: summary(), detail: null, loading: false, error: 'Network failed' },
      global: { stubs },
    });
    await failed.get('button:not([aria-label])').trigger('click');
    expect(failed.get('[role="alert"]').text()).toContain('Network failed');
    expect(failed.emitted('retry')?.[0]).toEqual([summary()]);
  });

  it('closes with Escape, traps focus, and restores previous focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(ContainerDetailPanel, {
      attachTo: document.body,
      props: { container: summary(), detail: detail(), loading: false, error: null },
      global: { stubs },
    });
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Close details"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);

    const controls = wrapper.findAll('button, a');
    (controls[controls.length - 1].element as HTMLElement).focus();
    await controls[controls.length - 1].trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(controls[0].element);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('emits the repository action', async () => {
    const wrapper = mount(ContainerDetailPanel, {
      props: { container: summary(), detail: detail(), loading: false, error: null },
      global: { stubs },
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Edit repository'))!
      .trigger('click');
    expect(wrapper.emitted('editRepository')?.[0]).toEqual([summary()]);
  });

  it('offers a repository fix when the current mapping was not found', async () => {
    const container = summary({
      status: 'unknown',
      dataState: 'error',
      checkIssue: { code: 'repo-not-found', message: 'Missing', retryAt: null },
    });
    const wrapper = mount(ContainerDetailPanel, {
      props: { container, detail: null, loading: false, error: null },
      global: { stubs },
    });
    const action = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Fix repository'))!;
    await action.trigger('click');
    expect(wrapper.emitted('editRepository')?.[0]).toEqual([container]);
  });

  it('renders incomplete breaking history and wraps reverse keyboard focus', async () => {
    const wrapper = mount(ContainerDetailPanel, {
      attachTo: document.body,
      props: {
        container: summary({ lastChecked: null, releaseUrl: null, githubRepo: null }),
        detail: detail({
          historyComplete: false,
          lastChecked: null,
          releaseUrl: null,
          githubRepo: null,
          breakingChanges: [
            {
              version: '5.0.0',
              releaseName: null,
              reason: 'Migration required',
              releaseUrl: 'https://example.test/v5',
            },
          ],
        }),
        loading: false,
        error: null,
      },
      global: { stubs },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Migration required');
    expect(wrapper.text()).toContain('history may be incomplete');
    expect(wrapper.text()).not.toContain('Checked:');
    const controls = wrapper.findAll('button, a');
    (controls[0].element as HTMLElement).focus();
    await controls[0].trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(controls[controls.length - 1].element);
    wrapper.unmount();
  });
});
