import { z } from 'zod';
import { latestPriceReadsForNames } from '@profile/core';
import { useDb } from '../../utils/db';
import { apiError, validationError } from '../../utils/errors';

const QuerySchema = z.object({
  names: z.string().trim().min(1).max(4000),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);

  const names = parsed.data.names
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.length) return apiError(event, 400, 'VALIDATION', 'Provide at least one name');

  return latestPriceReadsForNames(useDb(), names);
});
