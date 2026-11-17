import type { SourceDiagnostic, SyncDiagnostics } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { countItems } from '../../catalog/index.js';
import * as identity from '../../identity/index.js';
import { readSyncSchedule } from '../repo/schedule.js';
import { SOURCE_IDS, listSources } from '../repo/sources.js';
import { syncBundleStates, type SyncRuntime } from './schedule.js';

function count(db: Db, sql: string, parameter?: number | string): number {
  const statement = db.prepare(sql);
  const row = (parameter === undefined ? statement.get() : statement.get(parameter)) as { c: number };
  return row.c;
}

/**
 * A per-source item count is only honest where the source owns its rows. Item-backed
 * sources share `item` and `upsertItem` rewrites `source_id`, so their count would
 * describe attribution; the UI shows the global catalog size instead.
 */
function recordsFor(db: Db, id: string, characterId: number | null): number | null {
  if (id === 'scpmodel') return count(db, "SELECT COUNT(*) AS c FROM price_latest WHERE source_id = 'scpmodel'");
  if (id === 'icons') return count(db, 'SELECT COUNT(*) AS c FROM icon');
  if (id === 'profile') {
    if (characterId == null) return null;
    return count(db, "SELECT COUNT(*) AS c FROM character_stat WHERE character_id = ? AND origin = 'api'", characterId);
  }
  return null;
}

export function syncDiagnostics(
  db: Db,
  runtime: { profileApiConfigured: boolean },
  now = Date.now(),
): SyncDiagnostics {
  const schedule = readSyncSchedule(db);
  const rows = listSources(db);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const character = identity.getCharacter(db);
  const characterId = character?.id ?? null;

  const bundleRuntime: SyncRuntime = {
    profileApiConfigured: runtime.profileApiConfigured,
    hasCharacter: character !== null,
    characterRegion: character?.region ?? null,
  };

  return {
    schedule,
    bundles: syncBundleStates(schedule, rows, bundleRuntime, now),
    sources: SOURCE_IDS.map((id): SourceDiagnostic => {
      const row = byId.get(id);
      if (!row) {
        return {
          id,
          kind: 'other',
          url: null,
          status: 'idle',
          lastOkAt: null,
          lastTryAt: null,
          lastError: null,
          commit: null,
          commitDate: null,
          records: null,
        };
      }
      return {
        id: row.id,
        kind: row.kind,
        url: row.url,
        status: row.status,
        lastOkAt: row.last_ok_at,
        lastTryAt: row.last_try_at,
        lastError: row.last_error,
        commit: row.commit_sha,
        commitDate: row.commit_date,
        records: recordsFor(db, id, characterId),
      };
    }),
    catalogItems: countItems(db),
    profileApiConfigured: runtime.profileApiConfigured,
  };
}
