import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:3100';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('sync endpoint validates the source and the origin', async ({ page }) => {
  await login(page);

  const unknown = await page.request.post('/api/v1/admin/sync', {
    headers: { origin: ORIGIN },
    data: { source: 'nope' },
  });
  expect(unknown.status()).toBe(400);
  await expect(unknown.json()).resolves.toMatchObject({ error: { code: 'VALIDATION' } });

  const noOrigin = await page.request.post('/api/v1/admin/sync', {
    data: { source: 'profile' },
  });
  expect(noOrigin.status()).toBe(403);
  await expect(noOrigin.json()).resolves.toMatchObject({ error: { code: 'ORIGIN_REQUIRED' } });
});

test('settings shows source sync buttons', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  const button = page.getByRole('button', { name: 'База EXBO', exact: true });
  await expect(button).toBeEnabled();
});
