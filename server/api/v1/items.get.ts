import { z } from 'zod';
import { ItemKindSchema } from '@dossier/shared';
import { searchItems } from '@dossier/core';
import { useDb } from '../../utils/db';
import { validationError } from '../../utils/errors';
import { itemJson } from '../../utils/serialize';

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
  const items = searchItems(useDb(), { q: q ?? null, kind: kind ?? null, rank: rank ?? null, slot: slot ?? null, limit });
  return items.map((item) => itemJson(item));
});
