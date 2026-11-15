import { z } from 'zod';
import { buildPayload } from '@dossier/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';

const QuerySchema = z.object({
  kind: z.enum(['weapon', 'armor']).default('weapon'),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);

  const catalog = buildPayload(useDb()).catalog;
  return parsed.data.kind === 'armor' ? catalog.armor : catalog.weapons;
});
