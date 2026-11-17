import { expect, test } from '@playwright/test';

const LABELS = ['Overview', 'Weapons', 'Armor', 'Containers', 'Artifacts'];

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('the shell renders all five sections and the freshness badge', async ({ page }) => {
  await login(page);
  for (const label of LABELS) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  for (const label of ['Builds', 'Recommendations', 'Earnings', 'Notes']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(/Prices:/)).toBeVisible();
  await expect(page.getByLabel('Sign out')).toBeVisible();
});

test('the removed notes route is gone', async ({ page }) => {
  await login(page);
  expect((await page.request.get('/notes')).status()).toBe(404);
});

test('legacy ?tab= links redirect to routes', async ({ page }) => {
  await login(page);
  await page.goto('/?tab=weapons');
  await expect(page).toHaveURL(/\/weapons$/);
  await expect(page.getByRole('heading', { name: 'Weapons' })).toBeVisible();
});

test('navigation reaches a section and marks it active', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect(page).toHaveURL(/\/weapons$/);
  await expect(page.getByRole('heading', { name: 'Weapons' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Weapons', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('opening the language menu locks the page scroll', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 320 });
  await page.goto('/weapons');
  await expect(page.getByRole('heading', { name: 'Weapons' })).toBeVisible();

  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'Language' }).click();
  await expect(page.getByRole('menuitem', { name: 'Русский' })).toBeVisible();

  await page.mouse.move(360, 240);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('logout clears the session and returns to the login page', async ({ page }) => {
  await login(page);
  await page.getByLabel('Sign out').click();
  await expect(page).toHaveURL(/\/login/);
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(401);
});
