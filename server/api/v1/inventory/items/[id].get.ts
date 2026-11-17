import { inventoryItemRead } from '@profile/core';
import { useDb } from '../../../../utils/db';
import { apiError } from '../../../../utils/errors';
import { parseId } from '../../../../utils/write';

export default defineEventHandler((event) => {
  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const item = inventoryItemRead(useDb(), id);
  if (!item) return apiError(event, 404, 'ITEM_NOT_FOUND', 'Inventory item not found');
  return item;
});
