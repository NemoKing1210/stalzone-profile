import { SyncRequestSchema } from '@dossier/shared/schemas';
import { runSync, runSyncAll } from '@dossier/core/services/sync';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { serverSyncOptions } from '../../../utils/sync-options';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const parsed = SyncRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  const { source, force } = parsed.data;
  const options = { ...serverSyncOptions(), force };
  if (source === 'all') return { results: await runSyncAll(db, options) };
  return { results: [await runSync(db, source, options)] };
});
