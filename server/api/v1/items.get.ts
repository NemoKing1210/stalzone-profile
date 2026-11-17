import { z } from 'zod';
import { ItemKindSchema } from '@profile/shared';
import { searchItemSummaries } from '@profile/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';

const QuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: ItemKindSchema.optional(),
  rank: z.string().trim().max(50).optional(),
  slot: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);

  const { q, kind, rank, slot, limit } = parsed.data;
  return searchItemSummaries(useDb(), { q: q ?? null, kind: kind ?? null, rank: rank ?? null, slot: slot ?? null, limit });
});
