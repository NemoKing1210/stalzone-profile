import { z } from 'zod';
import { deleteOwned } from '@profile/core';
import { useDb } from '../../../utils/db';
import { apiError, validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { handleWrite, parseId } from '../../../utils/write';

const BodySchema = z.object({
  qty: z.number().int().min(1).max(99).optional(),
  dryRun: z.boolean().default(false),
});

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const parsed = BodySchema.safeParse((await readBody(event).catch(() => null)) ?? {});
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => deleteOwned(db, id, parsed.data));
});
