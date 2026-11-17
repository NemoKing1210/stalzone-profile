import { getItemById, getIcon, itemStats, listItemEffects } from '@dossier/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';
import { itemJson } from '../../../utils/serialize';

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');
  }

  const db = useDb();
  const item = getItemById(db, id);
  if (!item) return apiError(event, 404, 'ITEM_NOT_FOUND', 'Item not found');

  return itemJson(item, {
    icon: getIcon(db, id)?.path ?? null,
    stats: itemStats(db, id),
    effects: listItemEffects(db, id),
  });
});
