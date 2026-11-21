import { WeaponModificationWriteSchema } from '@profile/shared';
import { setWeaponModification } from '@profile/core';
import { useDb } from '../../../../../../utils/db';
import { apiError, validationError } from '../../../../../../utils/errors';
import { requireOrigin } from '../../../../../../utils/auth';
import { readJsonBodyResult } from '../../../../../../utils/read-body';
import { handleWrite, parseId } from '../../../../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const slot = getRouterParam(event, 'slot');
  if (!slot) return apiError(event, 400, 'VALIDATION', 'slot is required');

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = WeaponModificationWriteSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () =>
    setWeaponModification(db, id, slot, parsed.data.modificationItemId, parsed.data),
  );
});
