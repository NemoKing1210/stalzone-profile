import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const ORIGIN = 'http://127.0.0.1:3100';

test('healthz is public and reports the database', async ({ request }) => {
  const response = await request.get('/api/v1/healthz');
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ ok: true, db: 'ok' });
});

test('anonymous visitors are redirected to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/');
  await expect(page.getByRole('heading', { name: 'STALZONE Dossier' })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('anonymous API calls get the standard 401 envelope', async ({ request }) => {
  const response = await request.get('/api/auth/me');
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: { code: 'UNAUTHORIZED', message: 'Требуется вход' },
  });
});

test('wrong password returns 401 and sets no cookie', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    headers: { origin: ORIGIN },
    data: { password: 'wrong-password' },
  });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_PASSWORD' } });
  expect(response.headers()['set-cookie']).toBeUndefined();
});

test('the correct password signs an HttpOnly session and opens the dossier', async ({ page, context }) => {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'STALZONE Dossier' })).toBeVisible();

  const cookie = (await context.cookies()).find((item) => item.name === 'dossier_session');
  expect(cookie).toBeTruthy();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.value).toMatch(/^owner\.\d+\.[A-Za-z0-9_-]+$/);

  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  await expect(me.json()).resolves.toMatchObject({ authenticated: true });
});
