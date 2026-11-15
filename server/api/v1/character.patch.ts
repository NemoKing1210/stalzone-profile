import { CharacterPatchSchema } from '@dossier/shared';
import { patchCharacter } from '@dossier/core/services/writes';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';
import { requireOrigin } from '../../utils/auth';
import { handleWrite } from '../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const parsed = CharacterPatchSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => patchCharacter(db, parsed.data));
});
