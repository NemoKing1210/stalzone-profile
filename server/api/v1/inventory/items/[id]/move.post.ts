import { MoveItemSchema } from '@profile/shared';
import { moveInventoryItem } from '@profile/core';
import { useDb } from '../../../../../utils/db';
import { apiError, validationError } from '../../../../../utils/errors';
import { requireOrigin } from '../../../../../utils/auth';
import { handleWrite, parseId } from '../../../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const parsed = MoveItemSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => moveInventoryItem(db, id, parsed.data.target, parsed.data));
});
