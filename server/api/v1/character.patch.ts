import { CharacterPatchSchema } from '@profile/shared';
import { patchCharacter } from '@profile/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';
import { requireOrigin } from '../../utils/auth';
import { readJsonBodyResult } from '../../utils/read-body';
import { handleWrite } from '../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = CharacterPatchSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => patchCharacter(db, parsed.data));
});
