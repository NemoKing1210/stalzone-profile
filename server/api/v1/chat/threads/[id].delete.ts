import { z } from 'zod';
import { deleteChatThreadWrite } from '@profile/core';
import { requireOrigin } from '../../../../utils/auth';
import { useDb } from '../../../../utils/db';
import { apiError, validationError } from '../../../../utils/errors';
import { readJsonBodyResult } from '../../../../utils/read-body';
import { handleWrite, parseId } from '../../../../utils/write';

const BodySchema = z.object({
  dryRun: z.boolean().default(false),
});

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = BodySchema.safeParse(read.body ?? {});
  if (!parsed.success) return validationError(event, parsed.error);

  return handleWrite(event, () => deleteChatThreadWrite(useDb(), id, parsed.data.dryRun));
});
