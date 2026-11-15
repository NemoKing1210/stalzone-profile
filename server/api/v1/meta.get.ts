import { buildPayload } from '@dossier/core';
import { useDb } from '../../utils/db';

export default defineEventHandler(() => {
  const payload = buildPayload(useDb());
  return { meta: payload.meta, catalogMeta: payload.catalog.meta, freshness: payload.freshness };
});
