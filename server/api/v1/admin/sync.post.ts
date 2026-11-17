import { runExclusive, runSync, runSyncAll } from '@dossier/core';
import { SyncRequestSchema } from '@dossier/shared/contracts';
import { requireOrigin } from '../../../utils/auth';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';
import { serverSyncOptions } from '../../../utils/sync-options';
import { handleWriteAsync } from '../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const parsed = SyncRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) return validationError(event, parsed.error);

  const db = useDb();
  const { source, force } = parsed.data;
  const options = { ...serverSyncOptions(), force };
  return handleWriteAsync(event, async () => ({
    results: await runExclusive(() =>
      source === 'all' ? runSyncAll(db, options) : runSync(db, source, options).then((result) => [result]),
    ),
  }));
});
