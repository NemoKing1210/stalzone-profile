import { getItemById, itemStats } from '@dossier/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';
import { itemJson } from '../../../utils/serialize';

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError(event, 400, 'VALIDATION', 'id должен быть положительным целым числом');
  }

  const db = useDb();
  const item = getItemById(db, id);
  if (!item) return apiError(event, 404, 'ITEM_NOT_FOUND', 'Предмет не найден');

  return itemJson(item, { raw: true, stats: itemStats(db, id) });
});
