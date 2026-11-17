import { InventoryItemPatchSchema } from '@profile/shared';
import { updateInventoryItem } from '@profile/core';
import { useDb } from '../../../../utils/db';
import { apiError, validationError } from '../../../../utils/errors';
import { requireOrigin } from '../../../../utils/auth';
import { handleWrite, parseId } from '../../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const parsed = InventoryItemPatchSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => updateInventoryItem(db, id, parsed.data));
});
