import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusBadge from '../StatusBadge.vue';
import type { ContainerInfo } from '../../types';

type Status = ContainerInfo['status'];

const cases: { status: Status; label: string; colorClass: string }[] = [
  { status: 'up-to-date',       label: 'Up to date',       colorClass: 'text-emerald-400' },
  { status: 'update-available', label: 'Update available',  colorClass: 'text-amber-400'   },
  { status: 'breaking-change',  label: 'Breaking change!',  colorClass: 'text-red-400'     },
  { status: 'unknown',          label: 'Unknown',           colorClass: 'text-gray-400'    },
  { status: 'no-repo',          label: 'No repo linked',    colorClass: 'text-blue-400'    },
];

describe('StatusBadge', () => {
  for (const { status, label, colorClass } of cases) {
    it(`renders correct label for status "${status}"`, () => {
      const wrapper = mount(StatusBadge, { props: { status } });
      expect(wrapper.text()).toBe(label);
    });

    it(`applies correct color class for status "${status}"`, () => {
      const wrapper = mount(StatusBadge, { props: { status } });
      expect(wrapper.find('span').classes()).toContain(colorClass);
    });
  }

  it('renders a <span> element', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'up-to-date' } });
    expect(wrapper.element.tagName.toLowerCase()).toBe('span');
  });

  it('always includes base classes for badge styling', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'unknown' } });
    const classes = wrapper.find('span').classes();
    expect(classes).toContain('rounded-full');
    expect(classes).toContain('text-xs');
    expect(classes).toContain('font-medium');
  });
});
