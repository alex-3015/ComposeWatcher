export function formatExactDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

export function formatRelativeTime(value: string | null, now = Date.now()): string {
  if (!value) return 'Never checked';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Unknown';
  const seconds = Math.round((timestamp - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const ranges: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let valueInUnit = seconds;
  for (const [boundary, unit] of ranges) {
    if (Math.abs(valueInUnit) < boundary) return formatter.format(Math.round(valueInUnit), unit);
    valueInUnit /= boundary;
  }
  return formatter.format(Math.round(valueInUnit), 'year');
}
