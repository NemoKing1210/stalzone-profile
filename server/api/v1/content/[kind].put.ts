import { ContentBlockInputSchema } from '@dossier/shared';
import { putContentBlock } from '@dossier/core/services/writes';
import { useDb } from '../../../utils/db';
import { apiError, validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { handleWrite } from '../../../utils/write';

const KINDS = new Set(['recs', 'earnings', 'builds_meta', 'catalog_meta']);

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const kind = getRouterParam(event, 'kind') ?? '';
  if (!KINDS.has(kind)) return apiError(event, 400, 'VALIDATION', 'Unknown block kind');

  const body = (await readBody(event).catch(() => null)) as Record<string, unknown> | null;
  const parsed = ContentBlockInputSchema.safeParse({ ...body, kind });
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  return handleWrite(event, () => putContentBlock(db, parsed.data));
});
