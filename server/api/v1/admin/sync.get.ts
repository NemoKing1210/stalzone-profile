import { syncDiagnostics } from '@dossier/core';
import { useDb } from '../../../utils/db';
import { serverSyncOptions } from '../../../utils/sync-options';

export default defineEventHandler(() =>
  syncDiagnostics(useDb(), { profileApiConfigured: Boolean(serverSyncOptions().profileApi) }),
);
