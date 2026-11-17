import { getItemDetail } from '@profile/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');
  }

  const item = getItemDetail(useDb(), id);
  if (!item) return apiError(event, 404, 'ITEM_NOT_FOUND', 'Item not found');
  return item;
});
