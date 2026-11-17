import { ItemLayoutWriteSchema } from '@profile/shared';
import { setItemLayout } from '@profile/core';
import { useDb } from '../../../../utils/db';
import { apiError, validationError } from '../../../../utils/errors';
import { requireOrigin } from '../../../../utils/auth';
import { handleWrite, parseId } from '../../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const parsed = ItemLayoutWriteSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => setItemLayout(db, id, parsed.data, parsed.data));
});
