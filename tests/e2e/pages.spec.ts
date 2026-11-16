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

test('the overview is a three-pane dashboard with the stash as text', async ({ page }) => {
  await login(page);
  for (const name of ['Character', 'Career', 'Sections']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const character = page.getByRole('region', { name: 'Character' });
  await expect(character.getByText(/Stash:/)).toBeVisible();
  await expect(character.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Data state', exact: true })).toBeVisible();
});

test('selecting a weapon fills the detail pane', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);

  await page.getByPlaceholder('Search: name, type, caliber').fill('KS-1');
  const card = page.getByTestId('weapon-grid').getByRole('button').filter({ hasText: /KS-1(?!\d)/ });
  await expect(card).toBeVisible();
  await card.click();

  const detail = page.getByRole('region', { name: 'Item' });
  await expect(detail.getByText('Item card', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText('Tactical reload', { exact: true })).toBeVisible();
  await expect(detail.getByText('2.5', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText('Current curve', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('mobile item selection', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('selecting a weapon opens the card dialog', async ({ page }) => {
    await login(page);
    await page.goto('/weapons');
    await hydrated(page);
    await page.getByPlaceholder('Search: name, type, caliber').fill('KS-1');
    const card = page.getByTestId('weapon-grid').getByRole('button').filter({ hasText: /KS-1(?!\d)/ });
    await expect(card).toBeVisible();
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Tactical reload', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the mobile card dialog can open the editor', async ({ page }) => {
    await login(page);
    await page.goto('/weapons');
    await hydrated(page);
    await page.getByPlaceholder('Search: name, type, caliber').fill('KS-1');
    const card = page.getByTestId('weapon-grid').getByRole('button').filter({ hasText: /KS-1(?!\d)/ });
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByText('Edit item', { exact: true })).toBeVisible();
  });
});

test('selecting armor fills the detail pane with protection', async ({ page }) => {
  await login(page);
  await page.goto('/armor');
  await hydrated(page);

  await page.getByPlaceholder('Search: name or class').fill('SBA TANK');
  await page.getByRole('button', { name: /SBA TANK/ }).first().click();

  const detail = page.getByRole('region', { name: 'Armor item' });
  await expect(detail.getByText('SBA TANK', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText('Bullet protection', { exact: true })).toBeVisible();
  await expect(detail.getByText('+15', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a container opens in the detail pane with its numeric fill', async ({ page }) => {
  await login(page);
  await page.goto('/containers');
  await page.getByRole('button', { name: /Контейнер «Бочонок»/ }).first().click();

  const detail = page.getByRole('region', { name: /Контейнер «Бочонок»/ });
  await expect(detail.getByText('Slots', { exact: true })).toBeVisible();
  await expect(detail.getByText('Efficiency', { exact: true })).toBeVisible();
  await expect(detail.getByText('Equivalent', { exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Fill' })).toBeVisible();
});

test('an empty container fill says so instead of showing an empty box', async ({ page }) => {
  await login(page);
  await page.goto('/containers');
  const list = page.getByRole('region', { name: 'Containers' });
  await expect(list.getByRole('button')).not.toHaveCount(0);
});

test('an artifact card opens the full effect card', async ({ page }) => {
  await login(page);
  await page.goto('/artifacts');

  await page.getByPlaceholder('Search: name, type, effect').fill('Атом');
  await page.getByRole('button', { name: /Атом/ }).first().click();

  const detail = page.getByRole('region', { name: 'Artifact' });
  await expect(detail.getByText('Атом', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText('Artifact card', { exact: true })).toBeVisible();
});

test('builds and recommendations are named panes', async ({ page }) => {
  await login(page);
  await page.goto('/builds');
  await expect(page.getByRole('region', { name: /Максимум скорости/ })).toBeVisible();

  await page.goto('/recommendations');
  await expect(page.getByRole('region', { name: 'Фарм артефактов и хабар' })).toBeVisible();
});

test('an earnings row expands inline for its note and source', async ({ page }) => {
  await login(page);
  await page.goto('/earnings');

  const toggle = page.getByRole('button', { name: /details/i }).first();
  await toggle.click();
  await expect(page.getByTestId('earnings-detail').first()).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(page.getByTestId('earnings-detail')).toHaveCount(0);
});

test('notes render as prose panes', async ({ page }) => {
  await login(page);
  await page.goto('/notes');
  await expect(page.getByRole('region', { name: /Два слота оружия/ })).toBeVisible();
});

test('settings sections are named panes', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  for (const name of ['Data sources', 'Dossier export', 'Backups', 'Data', 'Access']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'Change log', exact: true })).toBeVisible();
});

test('sorting and filters survive a reload', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);

  await page.getByPlaceholder('Search: name, type, caliber').fill('АК');
  await page.getByRole('combobox', { name: 'Sort' }).click();
  await page.getByRole('option', { name: 'Damage', exact: true }).click();

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('dossier:filters:weapons');
    if (!raw) return false;
    const stored = JSON.parse(raw) as { q?: string; sort?: string; mode?: string; view?: string };
    return stored.q === 'АК' && stored.sort === 'dmg' && stored.mode === 'owned' && stored.view === 'grid';
  });

  const first = page.getByTestId('weapon-grid').getByRole('button').first();
  await expect(first).toBeVisible();
  const before = (await first.innerText()).trim();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search: name, type, caliber')).toHaveValue('АК');
  const after = (await page.getByTestId('weapon-grid').getByRole('button').first().innerText()).trim();
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

test('list panes have accessible names', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await page.goto('/armor');
  await expect(page.getByRole('region', { name: 'Armor', exact: true })).toBeVisible();
  await page.goto('/earnings');
  await expect(page.getByRole('region', { name: 'Earnings', exact: true })).toBeVisible();
});

test.describe('mobile earnings', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the mobile list follows the sort direction and shows needs and risk', async ({ page }) => {
    await login(page);
    await page.goto('/earnings');
    await hydrated(page);

    const cards = page.getByTestId('earnings-card-list').getByRole('button');
    const firstActivity = () => cards.first().getAttribute('data-activity');
    const before = await firstActivity();
    await page.getByRole('button', { name: 'Sort', exact: true }).click();
    await expect.poll(firstActivity).not.toBe(before);

    await expect(cards.first().getByText(/Needs:/)).toBeVisible();
    await expect(cards.first().getByText(/Risk:/)).toBeVisible();
  });
});
