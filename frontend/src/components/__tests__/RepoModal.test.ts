import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RepoModal from '../RepoModal.vue';
import type { ContainerInfo } from '../../types';

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'docker-compose.yml::sonarr',
    name: 'sonarr',
    image: 'ghcr.io/linuxserver/sonarr',
    currentVersion: '4.0.0',
    composeFile: 'docker-compose.yml',
    githubRepo: null,
    latestVersion: null,
    publishedAt: null,
    status: 'no-repo',
    breakingChangeReason: null,
    releaseUrl: null,
    lastChecked: null,
    ...overrides,
  };
}

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
    // The header X button is the only button with class text-gray-500
    await w.find('button.text-gray-500').trigger('click');
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
