import { expect, test } from '@playwright/test';

const LABELS = [
  'Обзор',
  'Оружие',
  'Броня',
  'Контейнеры',
  'Артефакты',
  'Сборки',
  'Рекомендации',
  'Заработок',
  'Заметки',
];

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('the shell renders all nine sections and the freshness badge', async ({ page }) => {
  await login(page);
  for (const label of LABELS) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Обзор', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(/Цены:/)).toBeVisible();
  await expect(page.getByLabel('Выйти')).toBeVisible();
});

test('legacy ?tab= links redirect to routes', async ({ page }) => {
  await login(page);
  await page.goto('/?tab=builds');
  await expect(page).toHaveURL(/\/builds$/);
  await expect(page.getByRole('heading', { name: 'Сборки' })).toBeVisible();
});

test('navigation reaches a section and marks it active', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Оружие', exact: true }).click();
  await expect(page).toHaveURL(/\/weapons$/);
  await expect(page.getByRole('heading', { name: 'Оружие' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Оружие', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('logout clears the session and returns to the login page', async ({ page }) => {
  await login(page);
  await page.getByLabel('Выйти').click();
  await expect(page).toHaveURL(/\/login/);
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(401);
});
