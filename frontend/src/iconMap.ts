/** Maps container/service names to selfh.st icon references.
 *  Only entries that differ from the service name need to be listed. */
export const ICON_NAME_MAP: Record<string, string> = {
  adguardhome: 'adguard-home',
  'portainer-ce': 'portainer',
  'portainer-ee': 'portainer',
};

const ICON_BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png';

export function getContainerIconUrl(serviceName: string): string {
  const key = serviceName.toLowerCase().trim();
  const reference = ICON_NAME_MAP[key] ?? key;
  return `${ICON_BASE}/${reference}.png`;
}
