import { OwnedPatchSchema } from '@dossier/shared';
import { updateOwned } from '@dossier/core/services/writes';
import { useDb } from '../../../utils/db';
import { apiError, validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { handleWrite, parseId } from '../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id должен быть положительным целым числом');

  const parsed = OwnedPatchSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => updateOwned(db, id, parsed.data));
});
