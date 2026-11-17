import { buildDetailEntry } from '@profile/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';

export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key') ?? '';
  if (!key || key.length > 300) return apiError(event, 400, 'VALIDATION', 'Invalid card key');

  const entry = buildDetailEntry(useDb(), key);
  if (!entry) return apiError(event, 404, 'DETAIL_NOT_FOUND', 'Card not found');

  const { item, card } = entry;
  return {
    key,
    itemId: item.id,
    kind: item.kind,
    name: item.name,
    data: card,
    updatedAt: item.updated_at,
  };
});
