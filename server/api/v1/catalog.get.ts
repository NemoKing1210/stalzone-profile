import { z } from 'zod';
import { buildCatalogSection } from '@profile/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';

const QuerySchema = z.object({
  kind: z.enum(['weapon', 'armor', 'device']).default('weapon'),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);

  return buildCatalogSection(useDb(), parsed.data.kind);
});
