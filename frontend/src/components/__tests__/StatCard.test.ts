import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, markRaw } from 'vue';
import StatCard from '../StatCard.vue';

// Simple stub icon component (markRaw prevents Vue reactivity warning)
const FakeIcon = markRaw(defineComponent({
  name: 'FakeIcon',
  render() {
    return h('svg', { class: 'fake-icon' });
  },
}));

describe('StatCard', () => {
  it('renders the count', () => {
    const w = mount(StatCard, {
      props: {
        icon: FakeIcon,
        count: 5,
        label: 'Breaking',
        bgClass: 'bg-red-500/10',
        borderClass: 'border-red-500/20',
        textClass: 'text-red-400',
      },
    });
    expect(w.text()).toContain('5');
  });

  it('renders the label', () => {
    const w = mount(StatCard, {
      props: {
        icon: FakeIcon,
        count: 3,
        label: 'Updates',
        bgClass: 'bg-amber-500/10',
        borderClass: 'border-amber-500/20',
        textClass: 'text-amber-400',
      },
    });
    expect(w.text()).toContain('Updates');
  });

  it('applies the bgClass and borderClass to the wrapper', () => {
    const w = mount(StatCard, {
      props: {
        icon: FakeIcon,
        count: 0,
        label: 'No repo',
        bgClass: 'bg-blue-500/10',
        borderClass: 'border-blue-500/20',
        textClass: 'text-blue-400',
      },
    });
    const root = w.find('div');
    const classes = root.classes().join(' ');
    expect(classes).toContain('bg-blue-500/10');
    expect(classes).toContain('border-blue-500/20');
  });

  it('renders the icon component', () => {
    const w = mount(StatCard, {
      props: {
        icon: FakeIcon,
        count: 1,
        label: 'Up to date',
        bgClass: 'bg-emerald-500/10',
        borderClass: 'border-emerald-500/20',
        textClass: 'text-emerald-400',
      },
    });
    expect(w.find('.fake-icon').exists()).toBe(true);
  });

  it('displays zero count correctly', () => {
    const w = mount(StatCard, {
      props: {
        icon: FakeIcon,
        count: 0,
        label: 'Breaking',
        bgClass: 'bg-red-500/10',
        borderClass: 'border-red-500/20',
        textClass: 'text-red-400',
      },
    });
    expect(w.text()).toContain('0');
  });
});
