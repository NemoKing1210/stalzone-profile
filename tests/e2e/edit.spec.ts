import { expect, test, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function ks1Row(page: Page) {
  await page.goto('/weapons');
  await page.getByPlaceholder('Поиск: название, тип, калибр').fill('KS-1');
  const row = page
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'KS-1', exact: true }) })
    .first();
  await expect(row).toBeVisible();
  return row;
}

test('edit, dry run and rollback keep the dossier consistent', async ({ page }) => {
  await login(page);

  const row = await ks1Row(page);
  const levelCell = row.locator('td').nth(3);
  const before = (await levelCell.innerText()).trim();
  expect(before).toMatch(/^\+\d+$/);

  const edited = before === '+14' ? 13 : 14;
  await row.getByRole('button', { name: 'Изменить KS-1', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Редактировать предмет', { exact: true })).toBeVisible();

  await dialog.getByRole('spinbutton', { name: 'Уровень заточки' }).fill(String(edited));
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(levelCell).toHaveText(`+${edited}`);

  await page.reload();
  const reloaded = await ks1Row(page);
  await expect(reloaded.locator('td').nth(3)).toHaveText(`+${edited}`);

  await page.goto('/settings');
  await expect(page.getByText('Изменение предмета', { exact: true }).first()).toBeVisible();

  const dryRow = await ks1Row(page);
  await dryRow.getByRole('button', { name: 'Изменить KS-1', exact: true }).click();
  await expect(dialog.getByText('Редактировать предмет', { exact: true })).toBeVisible();
  await dialog.getByRole('switch').click();
  const dryLevel = edited === 15 ? 14 : 15;
  await dialog.getByRole('spinbutton', { name: 'Уровень заточки' }).fill(String(dryLevel));
  await dialog.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(dialog.getByText('Пробный прогон', { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toBeHidden();

  const stillEdited = await ks1Row(page);
  await expect(stillEdited.locator('td').nth(3)).toHaveText(`+${edited}`);

  await page.goto('/settings');
  await page.getByRole('button', { name: /Откатить событие/ }).first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('Откатить изменение', { exact: true })).toBeVisible();
  await confirm.getByRole('button', { name: 'Откатить', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('Откат', { exact: true }).first()).toBeVisible();

  const restored = await ks1Row(page);
  await expect(restored.locator('td').nth(3)).toHaveText(before);
});
