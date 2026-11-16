import { expect, test, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('the accent switch applies immediately and survives a reload', async ({ page }) => {
  await login(page);
  await page.goto('/settings');

  await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');
  await page.getByText('Amber', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /Amber/ })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'amber');

  const accent = await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--sz-accent').trim());
  expect(accent.toLowerCase()).toBe('#e0a63c');
  const positive = await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--sz-success').trim());
  expect(positive.toLowerCase()).toBe('#63b356');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'amber');
  await page.getByRole('button', { name: /Reset to game default/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');
});

test('an invalid stored accent falls back to green', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dossier.accent', 'red'));
  await login(page);
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');
});

test('the accent radio group is keyboard operable', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByRole('radio', { name: /Zone green/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /Amber/ })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'amber');
});

test('the focused accent option is visibly distinct from the selected one', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  const label = page.locator('label', { has: page.getByRole('radio', { name: /Zone green/ }) });
  await page.getByRole('radio', { name: /Zone green/ }).focus();
  expect(await label.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await label.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
});
