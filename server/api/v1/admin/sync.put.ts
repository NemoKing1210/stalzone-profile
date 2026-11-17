import { setSyncSchedule } from '@dossier/core';
import { SyncScheduleUpdateSchema } from '@dossier/shared/contracts';
import { requireOrigin } from '../../../utils/auth';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';
import { handleWrite } from '../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const parsed = SyncScheduleUpdateSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  return handleWrite(event, () => setSyncSchedule(useDb(), parsed.data));
});
