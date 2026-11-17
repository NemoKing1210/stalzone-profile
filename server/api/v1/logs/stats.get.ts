import { z } from 'zod';
import { logStats } from '@profile/core';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';

const QuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);
  return logStats(useDb(), parsed.data.windowHours);
});
