import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ReleaseNotes from '../ReleaseNotes.vue';

const stubs = ['ChevronDown'];

describe('ReleaseNotes – rendering', () => {
  it('renders nothing when releaseNotes is null', () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: null, releaseName: null },
      global: { stubs },
    });
    expect(w.find('button').exists()).toBe(false);
  });

  it('renders a toggle button when releaseNotes is provided', () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '## Changes\n- Fixed bugs', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    expect(w.find('button').exists()).toBe(true);
    expect(w.text()).toContain('v1.0.0');
  });

  it('shows "Release Notes" as fallback when releaseName is null', () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '## Changes', releaseName: null },
      global: { stubs },
    });
    expect(w.text()).toContain('Release Notes');
  });
});

describe('ReleaseNotes – expand/collapse', () => {
  it('content is hidden by default', () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '## Changes\n- Fixed bugs', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    const content = w.find('.release-notes-content');
    expect(content.exists()).toBe(true);
    // v-show sets display:none
    expect(content.attributes('style')).toContain('display: none');
  });

  it('expands content on button click', async () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '## Changes\n- Fixed bugs', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    await w.find('button').trigger('click');
    const content = w.find('.release-notes-content');
    expect(content.isVisible()).toBe(true);
  });

  it('collapses content on second button click', async () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '## Changes', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    await w.find('button').trigger('click');
    expect(w.find('.release-notes-content').attributes('style') ?? '').not.toContain(
      'display: none',
    );

    await w.find('button').trigger('click');
    expect(w.find('.release-notes-content').attributes('style')).toContain('display: none');
  });
});

describe('ReleaseNotes – markdown rendering', () => {
  it('renders markdown as HTML', async () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '**bold text**', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    await w.find('button').trigger('click');
    expect(w.find('.release-notes-content').html()).toContain('<strong>bold text</strong>');
  });

  it('renders lists from markdown', async () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '- item one\n- item two', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    await w.find('button').trigger('click');
    expect(w.find('.release-notes-content').html()).toContain('<li>');
  });
});

describe('ReleaseNotes – sanitization', () => {
  it('strips script tags from release notes', async () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '<script>alert("xss")</script>Safe content', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    await w.find('button').trigger('click');
    const html = w.find('.release-notes-content').html();
    expect(html).not.toContain('<script>');
    expect(html).toContain('Safe content');
  });

  it('strips onerror attributes from img tags', async () => {
    const w = mount(ReleaseNotes, {
      props: { releaseNotes: '<img src=x onerror="alert(1)">', releaseName: 'v1.0.0' },
      global: { stubs },
    });
    await w.find('button').trigger('click');
    const html = w.find('.release-notes-content').html();
    expect(html).not.toContain('onerror');
  });
});
