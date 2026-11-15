import { getDetailsCard } from '@dossier/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';
import { parseJson } from '../../../utils/serialize';

export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key') ?? '';
  if (!key || key.length > 300) return apiError(event, 400, 'VALIDATION', 'Invalid card key');

  const card = getDetailsCard(useDb(), key);
  if (!card) return apiError(event, 404, 'DETAIL_NOT_FOUND', 'Card not found');

  return {
    key: card.key,
    itemId: card.item_id,
    kind: card.kind,
    name: card.name,
    data: parseJson(card.data),
    updatedAt: card.updated_at,
  };
});
