import { expect, test, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function switchLanguage(page: Page, currentLabel: RegExp, target: string): Promise<void> {
  await page.getByRole('button', { name: currentLabel }).click();
  await page.getByRole('menuitem', { name: target, exact: true }).click();
}

test('the language switch translates the interface and survives a reload', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Hours in game', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');

  await switchLanguage(page, /Language/, 'Русский');
  await expect(page.getByRole('link', { name: 'Оружие', exact: true })).toBeVisible();
  await expect(page.getByText('Часов в игре', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru-RU');

  await page.reload();
  await expect(page.getByText('Часов в игре', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Оружие', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru-RU');

  await switchLanguage(page, /Язык/, 'English');
  await expect(page.getByText('Hours in game', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByText('Owner access only', { exact: true })).toHaveCount(0);
  await expect(page.locator('p.sz-caps', { hasText: 'Personal dossier' })).toHaveCount(0);
});
