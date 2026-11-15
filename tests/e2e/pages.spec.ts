import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const EMPTY_PORT = process.env.E2E_EMPTY_PORT ?? '3111';
const EMPTY_BASE = `http://127.0.0.1:${EMPTY_PORT}`;
const EMPTY_DB = './data/e2e-empty.db';

async function login(page: Page, base = ''): Promise<void> {
  await page.goto(`${base}/login`);
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/$`));
}

/** Waits until Vue finished hydrating so typing cannot race the restored filters. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.getElementById('__nuxt');
    return Boolean(root && (root as unknown as { __vue_app__?: unknown }).__vue_app__);
  });
}

const SECTIONS: { path: string; heading: string; expected: string }[] = [
  { path: '/weapons', heading: 'Weapons', expected: 'KS-1' },
  { path: '/armor', heading: 'Armor', expected: 'SBA TANK' },
  { path: '/containers', heading: 'Containers', expected: 'Контейнер «Бочонок»' },
  { path: '/artifacts', heading: 'Artifacts', expected: 'Атом' },
  { path: '/builds', heading: 'Builds', expected: 'Максимум скорости · до 1 млн' },
  { path: '/recommendations', heading: 'Recommendations', expected: 'Фарм артефактов и хабар' },
  { path: '/earnings', heading: 'Earnings', expected: 'Прикопы и хлам на юге' },
  { path: '/notes', heading: 'Notes', expected: 'Два слота оружия' },
  { path: '/settings', heading: 'Settings', expected: 'EXBO base' },
];

test('every section renders seeded content', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Nemo_King' })).toBeVisible();
  await expect(page.getByText('Квестов выполнено')).toBeVisible();

  for (const section of SECTIONS) {
    await page.goto(section.path);
    await expect(page.getByRole('heading', { name: section.heading, exact: true })).toBeVisible();
    await expect(page.getByText(section.expected, { exact: true }).first()).toBeVisible();
  }
});

test('clicking a weapon opens its exact legacy card', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);

  await page.getByPlaceholder('Search: name, type, caliber').fill('KS-1');
  const cell = page.getByRole('cell', { name: 'KS-1', exact: true });
  await expect(cell).toBeVisible();
  await expect(cell).toHaveCount(1);
  await cell.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Item card', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('Tactical reload', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2.5', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('Current curve', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Raw card data')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('sorting and filters survive a reload', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);

  const search = page.getByPlaceholder('Search: name, type, caliber');
  await search.fill('АК');
  await page.getByRole('button', { name: 'Damage', exact: true }).click();

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('dossier:filters:weapons');
    if (!raw) return false;
    const stored = JSON.parse(raw) as { q?: string; sort?: string; mode?: string };
    return stored.q === 'АК' && stored.sort === 'dmg' && stored.mode === 'owned';
  });

  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();
  const before = (await firstRow.locator('td').first().innerText()).trim();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(search).toHaveValue('АК');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const after = (await page.locator('tbody tr').first().locator('td').first().innerText()).trim();
  expect(after).toBe(before);
});

test('pages render without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.includes('raw.githubusercontent.com')) {
      errors.push(`${message.text()} (${message.location().url})`);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await login(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nemo_King' })).toBeVisible();
  for (const section of SECTIONS) {
    await page.goto(section.path);
    await expect(page.getByRole('heading', { name: section.heading, exact: true })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test.describe('empty dossier', () => {
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    const env = { ...process.env, DB_PATH: EMPTY_DB };
    execSync('npm run db:reset', { env, stdio: 'ignore' });
    execSync('npm run db:migrate', { env, stdio: 'ignore' });

    server = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        PORT: EMPTY_PORT,
        HOST: '127.0.0.1',
        NUXT_DB_PATH: EMPTY_DB,
        NUXT_SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
        NUXT_PASSWORD: 'e2e-password',
        NUXT_LOGIN_RATE_MAX: '100',
      },
      stdio: 'ignore',
    });

    await waitForHealth(`${EMPTY_BASE}/api/v1/healthz`);
  });

  test.afterAll(() => {
    server?.kill();
    server = null;
  });

  test('every section shows an empty state without seed data', async ({ page }) => {
    await login(page, EMPTY_BASE);
    await expect(page.getByText('Dossier is empty')).toBeVisible();

    const expected: { path: string; text: string }[] = [
      { path: '/weapons', text: 'No weapons in the dossier' },
      { path: '/armor', text: 'No armor in the dossier' },
      { path: '/containers', text: 'No containers in the dossier' },
      { path: '/artifacts', text: 'No artifacts in the dossier' },
      { path: '/builds', text: 'No builds in the dossier' },
      { path: '/recommendations', text: 'No recommendations in the dossier' },
      { path: '/earnings', text: 'No earnings estimates in the dossier' },
      { path: '/notes', text: 'No notes in the dossier' },
      { path: '/settings', text: 'No sources registered' },
    ];

    for (const section of expected) {
      await page.goto(`${EMPTY_BASE}${section.path}`);
      await expect(page.getByText(section.text, { exact: false }).first()).toBeVisible();
    }
  });
});

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* server is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`empty dossier server did not start at ${url}`);
}
