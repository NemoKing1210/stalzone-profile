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
  sort: z.enum(['rank', 'name', 'weight']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export default defineEventHandler((event) => {
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) return validationError(event, parsed.error);

  const { q, kind, rank, slot, sort, dir, limit, offset } = parsed.data;
  return searchItemSummaries(useDb(), {
    q: q ?? null,
    kind: kind ?? null,
    rank: rank ?? null,
    slot: slot ?? null,
    sort: sort ?? null,
    dir: dir ?? null,
    limit,
    offset,
  });
});
