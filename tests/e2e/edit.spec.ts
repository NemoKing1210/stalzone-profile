import { expect, test, type Locator, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Waits until Vue finished hydrating so typing cannot race the restored filters. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.getElementById('__nuxt');
    return Boolean(root && (root as unknown as { __vue_app__?: unknown }).__vue_app__);
  });
}

async function ks1Row(page: Page) {
  await page.goto('/weapons');
  await hydrated(page);
  // The list view keeps the numeric table this test reads the level from.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByPlaceholder('Search: name, type, caliber').fill('KS-1');
  const row = page
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'KS-1', exact: true }) })
    .first();
  await expect(row).toBeVisible();
  return row;
}

/** Selects the row and opens the editor from the detail pane. */
async function editRow(page: Page, row: Locator): Promise<void> {
  await row.click();
  await page
    .getByRole('region', { name: 'Item' })
    .getByRole('button', { name: 'Edit KS-1', exact: true })
    .click();
}

test('edit, dry run and rollback keep the dossier consistent', async ({ page }) => {
  await login(page);

  const row = await ks1Row(page);
  const levelCell = row.locator('td').nth(3);
  const before = (await levelCell.innerText()).trim();
  expect(before).toMatch(/^\+\d+$/);

  const edited = before === '+14' ? 13 : 14;
  await editRow(page, row);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Edit item', { exact: true })).toBeVisible();

  await dialog.getByRole('spinbutton', { name: 'Level' }).fill(String(edited));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(levelCell).toHaveText(`+${edited}`);

  await page.reload();
  const reloaded = await ks1Row(page);
  await expect(reloaded.locator('td').nth(3)).toHaveText(`+${edited}`);

  await page.goto('/settings');
  await expect(page.getByText('Item changed', { exact: true }).first()).toBeVisible();

  const dryRow = await ks1Row(page);
  await editRow(page, dryRow);
  await expect(dialog.getByText('Edit item', { exact: true })).toBeVisible();
  await dialog.getByRole('switch').click();
  const dryLevel = edited === 15 ? 14 : 15;
  await dialog.getByRole('spinbutton', { name: 'Level' }).fill(String(dryLevel));
  await dialog.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(dialog.getByText('Dry run', { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();

  const stillEdited = await ks1Row(page);
  await expect(stillEdited.locator('td').nth(3)).toHaveText(`+${edited}`);

  await page.goto('/settings');
  await page.getByRole('button', { name: /Roll back event/ }).first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('Roll back change', { exact: true })).toBeVisible();
  await confirm.getByRole('button', { name: 'Roll back', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('Rollback', { exact: true }).first()).toBeVisible();

  const restored = await ks1Row(page);
  await expect(restored.locator('td').nth(3)).toHaveText(before);
});
