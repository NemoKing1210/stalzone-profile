import { expect, test, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Waits until Vue finished hydrating so a keystroke cannot race the restored page. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.getElementById('__nuxt');
    return Boolean(root && (root as unknown as { __vue_app__?: unknown }).__vue_app__);
  });
}

test('the shell uses the game theme tokens', async ({ page }) => {
  await login(page);
  await expect(page.locator('html')).toHaveClass(/dark/);

  const title = page.getByRole('heading', { name: 'Nemo_King' });
  expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Oswald');
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Roboto Condensed');
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(22, 22, 22)');

  const signOut = page.getByLabel('Sign out');
  expect(await signOut.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('0px');

  const active = page.getByRole('link', { name: 'Overview', exact: true });
  expect(await active.evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
  expect(await active.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('99, 179, 86');
});

test('login shares the same theme', async ({ page }) => {
  await page.goto('/login');
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(22, 22, 22)');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

const PAGES = ['/', '/weapons', '/armor', '/containers', '/artifacts', '/builds', '/recommendations', '/earnings', '/notes', '/settings'];

test('no page scrolls horizontally at 360, 768, 1024 or 1440', async ({ page }) => {
  await login(page);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect({ path, width, overflow }).toEqual({ path, width, overflow: 0 });
    }
  }
});

test('the Russian interface has no horizontal overflow at 390px', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /Language/ }).click();
  await page.getByRole('menuitem', { name: 'Русский', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect({ path, overflow }).toEqual({ path, overflow: 0 });
  }
});

test('the item grid is keyboard selectable and the modal closes on Esc', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);
  const card = page.getByTestId('weapon-grid').getByRole('button').first();
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Item' })).toContainText('Item card');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/weapons');
  await hydrated(page);
  await page.getByTestId('weapon-grid').getByRole('button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the tablet layout keeps two panes and hides the in-flow detail', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  const pages = [
    { path: '/weapons', list: 'Weapons', detail: 'Item' },
    { path: '/armor', list: 'Armor', detail: 'Armor item' },
  ];
  for (const entry of pages) {
    await page.goto(entry.path);
    const listBox = await page.getByRole('region', { name: entry.list, exact: true }).boundingBox();
    const sideBox = await page.getByRole('region', { name: 'Character', exact: true }).boundingBox();
    expect(listBox).not.toBeNull();
    expect(sideBox).not.toBeNull();
    expect(Math.abs((listBox?.y ?? 0) - (sideBox?.y ?? 0))).toBeLessThan(8);
    expect(sideBox?.x ?? 0).toBeLessThan(listBox?.x ?? 0);
    await expect(page.getByRole('region', { name: entry.detail, exact: true })).toBeHidden();
  }
});

test('card labels and pane counts use the readable muted token', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);
  const card = page.getByTestId('weapon-grid').getByRole('button').first();
  expect(await card.locator('.sz-caps').first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(154, 154, 148)');
  const hint = page.getByRole('region', { name: 'Weapons', exact: true }).locator('header span.tabular-nums');
  expect(await hint.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(154, 154, 148)');
});

test('grid cards name the rank in text, not only in colour', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await hydrated(page);
  const card = page.getByTestId('weapon-grid').getByRole('button').first();
  await expect(card.getByText(/^(Lockpick|Newbie|Stalker|Veteran|Master|Legend)$/)).toBeVisible();
});

test('a truncated build title keeps its full text available', async ({ page }) => {
  await login(page);
  await page.goto('/builds');
  const heading = page.getByRole('region', { name: /Максимум скорости/ }).getByRole('heading').first();
  expect(await heading.getAttribute('title')).toBeTruthy();
});

test('the top bar is opaque, compact and keeps every navigation item inside it', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const header = page.locator('header').first();
  expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(16, 16, 16)');
  expect((await header.boundingBox())?.height ?? 0).toBeLessThanOrEqual(56);

  const nav = page.locator('.sz-nav');
  const navBox = await nav.boundingBox();
  const actionsBox = await page.locator('header .ml-auto').boundingBox();
  const lastBox = await page.getByRole('link', { name: 'Notes', exact: true }).boundingBox();
  expect(navBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect((lastBox?.x ?? 0) + (lastBox?.width ?? 0)).toBeLessThanOrEqual((navBox?.x ?? 0) + (navBox?.width ?? 0));
  expect((lastBox?.x ?? 0) + (lastBox?.width ?? 0)).toBeLessThanOrEqual(actionsBox?.x ?? 0);

  const active = page.getByRole('link', { name: 'Overview', exact: true });
  expect(await active.evaluate((el) => getComputedStyle(el).fontSize)).toBe('11px');
  expect(await active.evaluate((el) => getComputedStyle(el).letterSpacing)).toBe('1.54px');
  expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await active.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await active.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('99, 179, 86');
});

test('the mobile top bar keeps the navigation in its own scrollable row', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const header = page.locator('header').first();
  expect((await header.boundingBox())?.height ?? 0).toBeLessThanOrEqual(100);
  const nav = page.locator('.sz-nav');
  expect(await nav.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('weapons place the detail between the sidebar and the item grid', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/weapons');

  const sidebar = await page.getByRole('region', { name: 'Character', exact: true }).boundingBox();
  const detail = await page.getByRole('region', { name: 'Item', exact: true }).boundingBox();
  const list = await page.getByRole('region', { name: 'Weapons', exact: true }).boundingBox();
  expect(sidebar).not.toBeNull();
  expect(detail).not.toBeNull();
  expect(list).not.toBeNull();
  expect(sidebar?.x ?? 0).toBeLessThan(detail?.x ?? 0);
  expect((detail?.x ?? 0) + (detail?.width ?? 0)).toBeLessThanOrEqual(list?.x ?? 0);
  expect(Math.round(detail?.width ?? 0)).toBe(296);
  expect(list?.width ?? 0).toBeGreaterThan(600);
});

test('the overview centres career and puts sections at the right, stacking them on mobile', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const career = await page.getByRole('region', { name: 'Career', exact: true }).boundingBox();
  const sections = await page.getByRole('region', { name: 'Sections', exact: true }).boundingBox();
  expect((career?.x ?? 0) + (career?.width ?? 0)).toBeLessThanOrEqual(sections?.x ?? 0);

  await page.setViewportSize({ width: 390, height: 844 });
  const character = await page.getByRole('region', { name: 'Character', exact: true }).boundingBox();
  const mobileSections = await page.getByRole('region', { name: 'Sections', exact: true }).boundingBox();
  const mobileCareer = await page.getByRole('region', { name: 'Career', exact: true }).boundingBox();
  expect(character?.y ?? 0).toBeLessThan(mobileSections?.y ?? 0);
  expect(mobileSections?.y ?? 0).toBeLessThan(mobileCareer?.y ?? 0);
});

test('cards and tables use the dossier surfaces', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/weapons');
  await hydrated(page);
  const card = page.getByTestId('weapon-grid').getByRole('button').first();
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(31, 31, 31)');

  await page.goto('/earnings');
  const th = page.locator('table th').first();
  expect(await th.evaluate((el) => getComputedStyle(el).fontSize)).toBe('11px');
  expect(await th.evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
  expect(await th.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(38, 38, 38)');
  const td = page.locator('table tbody tr').first().locator('td').first();
  expect((await td.boundingBox())?.height ?? 999).toBeLessThanOrEqual(56);
  expect(await td.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('6px');
  expect(await page.locator('table th').first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(34);
});

test('the overview title does not crowd its subtitle at 390', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const title = page.locator('h1');
  const metrics = await title.evaluate((el) => {
    const style = getComputedStyle(el);
    const subtitle = el.nextElementSibling;
    return {
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
      gap: subtitle ? subtitle.getBoundingClientRect().top - el.getBoundingClientRect().bottom : 0,
    };
  });
  expect(metrics.fontSize).toBeLessThanOrEqual(30);
  expect(metrics.lineHeight).toBeGreaterThanOrEqual(metrics.fontSize * 1.04);
  expect(metrics.gap).toBeGreaterThanOrEqual(0);
});

test('pane actions keep a 44px touch target on mobile', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes');
  const action = page.locator('[data-pane-actions] button').first();
  const box = await action.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('a long metric value wraps instead of crushing its label', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/builds');
  const label = page.getByText('Container', { exact: true }).first();
  expect(await label.evaluate((el) => el.getClientRects().length)).toBe(1);
});

test('freshness is stated once per page, in the top bar', async ({ page }) => {
  await login(page);
  await page.goto('/weapons');
  await expect(page.getByTestId('freshness')).toHaveCount(1);
  await expect(page.locator('header').getByTestId('freshness')).toHaveCount(1);
});

test('every build column fits its pane at 1440', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/builds');
  const scroller = page.locator('div.overflow-x-auto').first();
  const fits = await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
});
