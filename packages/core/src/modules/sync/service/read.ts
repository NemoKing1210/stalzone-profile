import type { SourceStatus as SourceStatusRead } from '@dossier/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import * as repo from '../repo/sources.js';
import type { SourceRow } from '../repo/sources.js';

export function sourceRead(row: SourceRow): SourceStatusRead {
  return {
    id: row.id,
    status: row.status,
    lastOkAt: row.last_ok_at,
    lastTryAt: row.last_try_at,
    lastError: row.last_error,
  };
}

export function listSourceReads(db: Db): SourceStatusRead[] {
  return repo.listSources(db).map(sourceRead);
}
