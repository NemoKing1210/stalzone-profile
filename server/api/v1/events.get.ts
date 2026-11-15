import { z } from 'zod';
import { listEvents } from '@dossier/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';
import { eventJson } from '../../utils/serialize';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);
  return listEvents(useDb(), parsed.data.limit).map(eventJson);
});
