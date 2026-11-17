import { buildDetails, findItemByKindName } from '@profile/core';
import { useDb } from '../../../utils/db';
import { apiError } from '../../../utils/errors';

const PREFIX_KINDS: Record<string, string> = {
  w: 'weapon',
  a: 'armor',
  art: 'artifact',
  c: 'container',
};

export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key') ?? '';
  if (!key || key.length > 300) return apiError(event, 400, 'VALIDATION', 'Invalid card key');

  const db = useDb();
  const data = buildDetails(db)[key];
  if (!data) return apiError(event, 404, 'DETAIL_NOT_FOUND', 'Card not found');

  const separator = key.indexOf(':');
  const kind = PREFIX_KINDS[key.slice(0, separator)] ?? null;
  const name = key.slice(separator + 1);
  const item = kind ? findItemByKindName(db, kind, name) : null;
  if (!item) return apiError(event, 404, 'DETAIL_NOT_FOUND', 'Card not found');

  return {
    key,
    itemId: item.id,
    kind: item.kind,
    name: item.name,
    data,
    updatedAt: item.updated_at,
  };
});
