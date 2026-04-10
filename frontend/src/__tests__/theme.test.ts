import { describe, it, expect } from 'vitest';
import { UI, STATUS_THEME } from '../theme';
import type { StatusKey } from '../theme';

// ────────────────────────────────────────────────────────────────────────────
// UI constants
// ────────────────────────────────────────────────────────────────────────────
describe('UI constants', () => {
  it('exports UI object', () => {
    expect(UI).toBeDefined();
    expect(typeof UI).toBe('object');
  });

  const expectedKeys = [
    'pageBg',
    'cardBg',
    'inputBg',
    'versionBoxBg',
    'borderDefault',
    'borderSubtle',
    'borderInput',
    'textPrimary',
    'textSecondary',
    'textMuted',
    'textFaint',
    'textDim',
    'textHover',
    'primaryText',
    'primaryTextHover',
    'primaryBg',
    'primaryBgHover',
    'errorBg',
    'errorBorder',
    'errorText',
    'errorTextHover',
  ];

  for (const key of expectedKeys) {
    it(`has "${key}" property`, () => {
      expect(UI).toHaveProperty(key);
    });
  }

  it('all UI values are non-empty strings', () => {
    for (const [key, value] of Object.entries(UI)) {
      expect(typeof value).toBe('string');
      expect(value.length, `UI.${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('all UI values are valid Tailwind CSS class strings', () => {
    for (const [key, value] of Object.entries(UI)) {
      // Tailwind classes shouldn't contain HTML, script, or injection characters
      expect(value, `UI.${key}`).not.toMatch(/[<>"'&]/);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// STATUS_THEME
// ────────────────────────────────────────────────────────────────────────────
describe('STATUS_THEME', () => {
  const allStatuses: StatusKey[] = [
    'up-to-date',
    'update-available',
    'breaking-change',
    'unknown',
    'no-repo',
  ];

  it('exports STATUS_THEME object', () => {
    expect(STATUS_THEME).toBeDefined();
    expect(typeof STATUS_THEME).toBe('object');
  });

  it('has entries for all 5 status types', () => {
    for (const status of allStatuses) {
      expect(STATUS_THEME).toHaveProperty(status);
    }
  });

  it('has exactly 5 entries (no extra statuses)', () => {
    expect(Object.keys(STATUS_THEME)).toHaveLength(5);
  });

  const requiredProperties = [
    'badgeLabel',
    'text',
    'textLight',
    'bg',
    'bgBadge',
    'border',
    'borderBadge',
    'borderStrong',
    'shadow',
  ];

  for (const status of allStatuses) {
    describe(`STATUS_THEME["${status}"]`, () => {
      for (const prop of requiredProperties) {
        it(`has "${prop}" property`, () => {
          expect(STATUS_THEME[status]).toHaveProperty(prop);
        });
      }

      it('all values are strings', () => {
        const entry = STATUS_THEME[status];
        for (const [key, value] of Object.entries(entry)) {
          expect(typeof value, `${status}.${key}`).toBe('string');
        }
      });

      it('badgeLabel is non-empty', () => {
        expect(STATUS_THEME[status].badgeLabel.length).toBeGreaterThan(0);
      });
    });
  }

  it('badge labels match expected values', () => {
    expect(STATUS_THEME['breaking-change'].badgeLabel).toBe('Breaking change!');
    expect(STATUS_THEME['update-available'].badgeLabel).toBe('Update available');
    expect(STATUS_THEME['up-to-date'].badgeLabel).toBe('Up to date');
    expect(STATUS_THEME['unknown'].badgeLabel).toBe('Unknown');
    expect(STATUS_THEME['no-repo'].badgeLabel).toBe('No repo linked');
  });

  it('each status has distinct text color', () => {
    const textColors = allStatuses.map((s) => STATUS_THEME[s].text);
    const unique = new Set(textColors);
    expect(unique.size).toBe(allStatuses.length);
  });

  it('breaking-change has red theme colors', () => {
    const bc = STATUS_THEME['breaking-change'];
    expect(bc.text).toContain('red');
    expect(bc.bg).toContain('red');
    expect(bc.border).toContain('red');
  });

  it('update-available has amber theme colors', () => {
    const ua = STATUS_THEME['update-available'];
    expect(ua.text).toContain('amber');
    expect(ua.bg).toContain('amber');
  });

  it('up-to-date has emerald theme colors', () => {
    const utd = STATUS_THEME['up-to-date'];
    expect(utd.text).toContain('emerald');
    expect(utd.bg).toContain('emerald');
  });

  it('unknown has gray theme colors', () => {
    const unk = STATUS_THEME['unknown'];
    expect(unk.text).toContain('gray');
    expect(unk.bg).toContain('gray');
  });

  it('no-repo has blue theme colors', () => {
    const nr = STATUS_THEME['no-repo'];
    expect(nr.text).toContain('blue');
    expect(nr.bg).toContain('blue');
  });

  it('breaking-change has shadow (highest severity)', () => {
    expect(STATUS_THEME['breaking-change'].shadow.length).toBeGreaterThan(0);
  });

  it('non-breaking statuses have no shadow', () => {
    expect(STATUS_THEME['update-available'].shadow).toBe('');
    expect(STATUS_THEME['up-to-date'].shadow).toBe('');
    expect(STATUS_THEME['unknown'].shadow).toBe('');
    expect(STATUS_THEME['no-repo'].shadow).toBe('');
  });
});
