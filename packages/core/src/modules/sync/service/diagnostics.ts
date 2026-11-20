import type { SourceDiagnostic, SourceRecordMetric, SyncDiagnostics } from '@profile/shared/contracts';
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

/** What each source owns in the database, named so the UI never presents a count as bytes. */
function recordsFor(
  db: Db,
  id: string,
  characterId: number | null,
): { records: number | null; metric: SourceRecordMetric | null } {
  if (id === 'exbo_base') {
    return { records: countItems(db), metric: 'catalog_items' };
  }
  if (id === 'wiki') {
    return { records: count(db, "SELECT COUNT(*) AS c FROM item_stat WHERE source_id = 'wiki'"), metric: 'stat_rows' };
  }
  if (id === 'motifs') {
    return { records: count(db, "SELECT COUNT(*) AS c FROM item WHERE kind = 'motif'"), metric: 'motif_items' };
  }
  if (id === 'scpmodel') {
    return {
      records: count(db, "SELECT COUNT(*) AS c FROM price_latest WHERE source_id = 'scpmodel'"),
      metric: 'price_quotes',
    };
  }
  if (id === 'icons') return { records: count(db, 'SELECT COUNT(*) AS c FROM icon'), metric: 'icons' };
  if (id === 'profile') {
    if (characterId == null) return { records: null, metric: 'character_stats' };
    return {
      records: count(
        db,
        "SELECT COUNT(*) AS c FROM character_stat WHERE character_id = ? AND origin = 'api'",
        characterId,
      ),
      metric: 'character_stats',
    };
  }
  if (id === 'local' && characterId != null) {
    return {
      records: count(db, 'SELECT COUNT(*) AS c FROM inventory_item WHERE character_id = ?', characterId),
      metric: 'inventory_items',
    };
  }
  return { records: null, metric: null };
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
          recordMetric: null,
        };
      }
      const measured = recordsFor(db, id, characterId);
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
        records: measured.records,
        recordMetric: measured.metric,
      };
    }),
    catalogItems: countItems(db),
    profileApiConfigured: runtime.profileApiConfigured,
  };
}
