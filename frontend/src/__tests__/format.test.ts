import { describe, expect, it } from 'vitest';
import { formatExactDate, formatRelativeTime } from '../format';

describe('date formatting', () => {
  it('handles missing and invalid values safely', () => {
    expect(formatExactDate(null)).toBe('Never');
    expect(formatExactDate('invalid')).toBe('Unknown');
    expect(formatRelativeTime(null)).toBe('Never checked');
    expect(formatRelativeTime('invalid')).toBe('Unknown');
  });

  it.each([
    [30_000, 'second'],
    [2 * 60_000, 'minute'],
    [2 * 60 * 60_000, 'hour'],
    [2 * 24 * 60 * 60_000, 'day'],
    [14 * 24 * 60 * 60_000, 'week'],
    [90 * 24 * 60 * 60_000, 'month'],
    [800 * 24 * 60 * 60_000, 'year'],
  ])('formats a %s millisecond difference using the %s range', (difference, unit) => {
    const now = Date.UTC(2026, 0, 1);
    const formatted = formatRelativeTime(new Date(now - difference).toISOString(), now);

    expect(formatted).toMatch(new RegExp(unit));
  });

  it('formats a valid exact date using the browser locale', () => {
    expect(formatExactDate('2026-07-13T12:00:00.000Z')).toMatch(/2026/);
  });
});
