import { CharacterCreateSchema } from '@profile/shared';
import { createSetupCharacter } from '@profile/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';
import { requireOrigin } from '../../utils/auth';
import { handleWrite } from '../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const parsed = CharacterCreateSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => createSetupCharacter(db, parsed.data));
});
