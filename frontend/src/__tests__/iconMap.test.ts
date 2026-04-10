import { describe, it, expect } from 'vitest';
import { getContainerIconUrl, ICON_NAME_MAP } from '../iconMap';

const BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png';

describe('getContainerIconUrl', () => {
  it('returns a direct URL for names that need no mapping', () => {
    expect(getContainerIconUrl('sonarr')).toBe(`${BASE}/sonarr.png`);
    expect(getContainerIconUrl('radarr')).toBe(`${BASE}/radarr.png`);
    expect(getContainerIconUrl('gitea')).toBe(`${BASE}/gitea.png`);
  });

  it('lowercases the service name', () => {
    expect(getContainerIconUrl('Sonarr')).toBe(`${BASE}/sonarr.png`);
    expect(getContainerIconUrl('RADARR')).toBe(`${BASE}/radarr.png`);
  });

  it('trims whitespace', () => {
    expect(getContainerIconUrl('  sonarr  ')).toBe(`${BASE}/sonarr.png`);
  });

  it('applies mapping for adguardhome', () => {
    expect(getContainerIconUrl('adguardhome')).toBe(`${BASE}/adguard-home.png`);
  });

  it('applies mapping for portainer-ce', () => {
    expect(getContainerIconUrl('portainer-ce')).toBe(`${BASE}/portainer.png`);
  });

  it('applies mapping for portainer-ee', () => {
    expect(getContainerIconUrl('portainer-ee')).toBe(`${BASE}/portainer.png`);
  });

  it('passes through unknown names unchanged', () => {
    expect(getContainerIconUrl('myapp')).toBe(`${BASE}/myapp.png`);
  });
});

describe('ICON_NAME_MAP', () => {
  it('is a plain object with string values', () => {
    for (const [key, value] of Object.entries(ICON_NAME_MAP)) {
      expect(typeof key).toBe('string');
      expect(typeof value).toBe('string');
    }
  });
});
