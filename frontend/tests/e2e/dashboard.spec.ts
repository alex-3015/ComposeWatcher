import { expect, test } from '@playwright/test';

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
  await myappCard.getByRole('button', { name: 'Edit GitHub repository for myapp' }).click();

  const dialog = page.getByRole('dialog', { name: /Link GitHub Repository/i });
  await dialog.getByLabel(/GitHub Repository/i).fill('example/myapp');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog).toBeHidden();
  await expect(myappCard.getByText('example/myapp')).toBeVisible();
  await expect(myappCard.getByText('pending data')).toBeVisible();
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
