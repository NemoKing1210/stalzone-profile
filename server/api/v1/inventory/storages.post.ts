import { StorageCreateSchema } from '@profile/shared';
import { createStorage } from '@profile/core';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { readJsonBodyResult } from '../../../utils/read-body';
import { handleWrite } from '../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = StorageCreateSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => createStorage(db, parsed.data));
});
