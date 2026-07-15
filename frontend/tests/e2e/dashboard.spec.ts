import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({
    'x-composewatcher-mock-session': `${testInfo.project.name}:${testInfo.testId}:${testInfo.retry}`,
  });
});

test('dashboard filters action states and opens lazy release details', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Compose Watcher' })).toBeVisible();
  await expect(page.getByText('9 containers across 8 Compose files')).toBeVisible();

  await page
    .getByRole('button', { name: /Breaking 3/ })
    .last()
    .click();
  await expect(page.getByRole('heading', { name: 'gitea' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'radarr' })).toBeHidden();

  const giteaCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'gitea' }) });
  const detailsButton = giteaCard.getByRole('button', { name: 'View details' });
  await detailsButton.click();
  const panel = page.getByRole('dialog', { name: 'gitea' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Major version bump: 1.21.4 → 2.0.0')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Gitea 2.0.0/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(detailsButton).toBeFocused();
});

test('repository mapping updates only the selected summary', async ({ page }) => {
  await page.goto('/');
  const myappCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'myapp' }) });
  const repositoryButton = myappCard.getByRole('button', {
    name: 'Link repository for myapp',
  });
  await repositoryButton.click();

  const dialog = page.getByRole('dialog', { name: /Link GitHub Repository/i });
  await dialog.getByLabel(/GitHub Repository/i).fill('example/myapp');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog).toBeHidden();
  await expect(myappCard.getByText('example/myapp')).toBeVisible();
  await expect(myappCard.getByText('pending data')).toBeVisible();
});

test('separates attention reasons and exposes a repository fix action', async ({ page }) => {
  await page.goto('/');
  const filters = page.getByRole('group', { name: 'Container filters' });
  await expect(filters.getByRole('button')).toHaveCount(7);

  await filters.getByRole('button', { name: /Check failed 1/ }).click();
  await expect(page.getByRole('heading', { name: 'sonarr' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fix repository for sonarr' })).toBeVisible();

  await filters.getByRole('button', { name: /Repository missing 1/ }).click();
  await expect(page.getByRole('heading', { name: 'myapp' })).toBeVisible();

  await filters.getByRole('button', { name: /Not comparable 1/ }).click();
  await expect(page.getByRole('heading', { name: 'portainer' })).toBeVisible();
});

test('compact view explains unavailable comparisons and repository actions', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith('mobile');
  if (mobile) await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Compact view' }).click();

  const filters = page.getByRole('group', { name: 'Container filters' });
  await expect(filters.getByRole('button')).toHaveCount(7);

  const portainerRow = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'portainer' }) });
  const notComparable = portainerRow.getByText('Not comparable', { exact: true });
  await expect(notComparable.filter({ visible: true }).first()).toBeVisible();
  if (mobile) {
    await expect(
      portainerRow.getByText('The rolling tag "latest" does not identify a comparable version.'),
    ).toBeVisible();
    const viewportWidths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(viewportWidths.scroll).toBeLessThanOrEqual(viewportWidths.client);
  } else {
    await expect(notComparable).toHaveCount(2);
  }
});

test('mobile group headers wrap metadata and interactive targets remain touch sized', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only layout assertion');
  await page.goto('/');

  const group = page.getByRole('button', { name: /media-stack\/docker-compose\.yml/ });
  const path = group.getByText('media-stack/docker-compose.yml', { exact: true });
  const count = group.getByText('2 containers', { exact: true });
  const pathBox = await path.boundingBox();
  const countBox = await count.boundingBox();
  expect(countBox?.y).toBeGreaterThan((pathBox?.y ?? 0) + (pathBox?.height ?? 0) - 1);

  const undersized = await page
    .locator('button:visible, a:visible, input:visible, select:visible')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            label: element.getAttribute('aria-label') ?? element.textContent,
            ...box.toJSON(),
          };
        })
        .filter((box) => box.width < 44 || box.height < 44),
    );
  expect(undersized).toEqual([]);
});

test('detail panel becomes a full-width mobile dialog', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only layout assertion');
  await page.goto('/');
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'radarr' }) });
  await card.getByRole('button', { name: 'View details' }).click();
  const panel = page.getByRole('dialog', { name: 'radarr' });
  const box = await panel.boundingBox();
  expect(box?.width).toBe(page.viewportSize()?.width);
});
