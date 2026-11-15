import { z } from 'zod';
import { latestPricesForNames } from '@dossier/core';
import { useDb } from '../../utils/db';
import { apiError, validationError } from '../../utils/errors';
import { priceJson } from '../../utils/serialize';

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
  if (!names.length) return apiError(event, 400, 'VALIDATION', 'Укажите хотя бы одно название');

  const prices = latestPricesForNames(useDb(), names);
  return Object.fromEntries(Object.entries(prices).map(([name, rows]) => [name, rows.map(priceJson)]));
});
