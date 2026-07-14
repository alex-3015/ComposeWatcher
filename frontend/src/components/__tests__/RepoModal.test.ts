import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import RepoModal from '../RepoModal.vue';
import { summary } from '../../__tests__/factories';

const makeContainer = (overrides = {}) =>
  summary({
    githubRepo: null,
    latestUpstreamVersion: null,
    publishedAt: null,
    status: 'no-repo',
    dataState: 'unlinked',
    updateKind: null,
    comparisonMode: 'unverifiable',
    iconUrl: null,
    releaseUrl: null,
    lastChecked: null,
    ...overrides,
  });

// Template button order:
//   [0] Header X-close button     (no visible text, contains <X> icon stub)
//   [1] Save button                text: "Save"
//   [2] Remove button (if repo)    text: "Remove"   OR  Cancel button
//   last Cancel button             text: "Cancel"
const stubs = ['GitBranch', 'X'];

function findBtn(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text)!;
}

describe('RepoModal – rendering', () => {
  it('exposes accessible dialog semantics and labels', () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    const dialog = w.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe('repo-modal-title');
    expect(w.get('label').attributes('for')).toBe('github-repository');
    expect(w.get('button[aria-label="Close repository dialog"]').attributes('aria-label')).toBe(
      'Close repository dialog',
    );
  });

  it('displays the container name', () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('sonarr');
  });

  it('displays the container image', () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.text()).toContain('ghcr.io/linuxserver/sonarr');
  });

  it('pre-fills input with existing githubRepo', () => {
    const w = mount(RepoModal, {
      props: { container: makeContainer({ githubRepo: 'linuxserver/sonarr' }) },
      global: { stubs },
    });
    expect((w.find('input').element as HTMLInputElement).value).toBe('linuxserver/sonarr');
  });

  it('renders empty input when githubRepo is null', () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    expect((w.find('input').element as HTMLInputElement).value).toBe('');
  });

  it('shows "Remove" button when githubRepo is already set', () => {
    const w = mount(RepoModal, {
      props: { container: makeContainer({ githubRepo: 'org/repo' }) },
      global: { stubs },
    });
    expect(findBtn(w, 'Remove').exists()).toBe(true);
  });

  it('hides "Remove" button when githubRepo is null', () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    const removeBtn = w.findAll('button').find((b) => b.text().trim() === 'Remove');
    expect(removeBtn).toBeUndefined();
  });

  it('renders inside a full-screen overlay', () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    expect(w.find('.fixed.inset-0').exists()).toBe(true);
  });
});

describe('RepoModal – validation', () => {
  it('shows error message for invalid repo format (no slash)', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('invalidformat');
    await findBtn(w, 'Save').trigger('click');
    expect(w.text()).toContain('Format: owner/repository');
  });

  it('shows error message for invalid repo format (spaces)', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('my org/my repo');
    await findBtn(w, 'Save').trigger('click');
    expect(w.text()).toContain('Format: owner/repository');
  });

  it('clears error message when user types again after validation error', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('bad');
    await findBtn(w, 'Save').trigger('click');
    expect(w.text()).toContain('Format: owner/repository');

    // Typing again clears the error via @input handler
    await w.find('input').trigger('input');
    expect(w.text()).not.toContain('Format: owner/repository');
  });

  it('does not show error for valid format "owner/repo"', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('myorg/myapp');
    await findBtn(w, 'Save').trigger('click');
    expect(w.text()).not.toContain('Format: owner/repository');
  });

  it('accepts valid formats with hyphens and dots', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('my-org/my.app_2');
    await findBtn(w, 'Save').trigger('click');
    expect(w.text()).not.toContain('Format: owner/repository');
  });

  it('allows saving with empty input (removes repo)', async () => {
    const w = mount(RepoModal, {
      props: { container: makeContainer({ githubRepo: 'org/repo' }) },
      global: { stubs },
    });
    await w.find('input').setValue('');
    await findBtn(w, 'Save').trigger('click');
    expect(w.text()).not.toContain('Format: owner/repository');
    expect(w.emitted('save')).toBeTruthy();
    expect(w.emitted('save')![0]).toEqual(['docker-compose.yml::sonarr', null]);
  });
});

describe('RepoModal – events', () => {
  it('closes when Escape is pressed', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.get('.fixed.inset-0').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toBeTruthy();
  });

  it('wraps focus from the last to the first control', async () => {
    const w = mount(RepoModal, {
      attachTo: document.body,
      props: { container: makeContainer() },
      global: { stubs },
    });
    await flushPromises();
    const buttons = w.findAll('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    (last.element as HTMLButtonElement).focus();
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first.element);
    w.unmount();
  });

  it('emits "save" with containerId and repo on valid save', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('linuxserver/sonarr');
    await findBtn(w, 'Save').trigger('click');

    expect(w.emitted('save')).toBeTruthy();
    expect(w.emitted('save')![0]).toEqual(['docker-compose.yml::sonarr', 'linuxserver/sonarr']);
  });

  it('emits "close" when Cancel button is clicked', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await findBtn(w, 'Cancel').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
  });

  it('emits "close" when X button in header is clicked', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.get('button[aria-label="Close repository dialog"]').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
  });

  it('emits "save" with null when Remove button is clicked', async () => {
    const w = mount(RepoModal, {
      props: { container: makeContainer({ githubRepo: 'org/repo' }) },
      global: { stubs },
    });
    await findBtn(w, 'Remove').trigger('click');
    expect(w.emitted('save')).toBeTruthy();
    expect(w.emitted('save')![0]).toEqual(['docker-compose.yml::sonarr', null]);
  });

  it('emits "save" when Enter key is pressed in the input', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('myorg/myapp');
    await w.find('input').trigger('keydown', { key: 'Enter' });

    expect(w.emitted('save')).toBeTruthy();
    expect(w.emitted('save')![0]).toEqual(['docker-compose.yml::sonarr', 'myorg/myapp']);
  });

  it('trims whitespace from the repo value before emitting', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('  myorg/myapp  ');
    await findBtn(w, 'Save').trigger('click');

    expect(w.emitted('save')![0]).toEqual(['docker-compose.yml::sonarr', 'myorg/myapp']);
  });

  it('does not emit "save" when validation fails', async () => {
    const w = mount(RepoModal, { props: { container: makeContainer() }, global: { stubs } });
    await w.find('input').setValue('invalidformat');
    await findBtn(w, 'Save').trigger('click');
    expect(w.emitted('save')).toBeFalsy();
  });
});
