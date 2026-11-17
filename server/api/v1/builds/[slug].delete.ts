import { z } from 'zod';
import { deleteBuild } from '@dossier/core';
import { useDb } from '../../../utils/db';
import { apiError, validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { handleWrite } from '../../../utils/write';

const BodySchema = z.object({
  dryRun: z.boolean().default(false),
});

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const slug = getRouterParam(event, 'slug');
  if (!slug) return apiError(event, 400, 'VALIDATION', 'slug is required');

  const parsed = BodySchema.safeParse((await readBody(event).catch(() => null)) ?? {});
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => deleteBuild(db, slug, parsed.data.dryRun));
});
