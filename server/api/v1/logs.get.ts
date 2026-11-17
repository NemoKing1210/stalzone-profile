import { LogQueryParamsSchema } from '@profile/shared/contracts';
import { queryLogs } from '@profile/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';

export default defineEventHandler((event) => {
  const parsed = LogQueryParamsSchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);
  return queryLogs(useDb(), parsed.data);
});
