import type { CleanupScope } from '@profile/shared/contracts';
import type { Db } from '../../platform/db/index.js';
import {
  eventCount,
  getEvent,
  logEvent,
  parseEventJson,
  replaceEvents,
  snapshotEvents,
  withTransaction,
  WriteError,
  type EventSnapshotRow,
  type WriteResult,
} from '../../platform/journal/index.js';
import {
  characterDataSnapshot,
  characterHasProfile,
  characterOrThrow,
  countCharacterStats,
  deleteCharacter,
  deleteManualStats,
  getCharacter,
  listCharacterStats,
  restoreCharacterDataTx,
  restoreCharacterTx,
  setCharacterStat,
  type CharacterDataSnapshot,
} from '../identity/index.js';
import {
  clearOwnedTx,
  deleteOwnedTx,
  listOwned,
  ownedCleanupSnapshot,
  ownedCounts,
  restoreContainerFillTx,
  restoreOwnedTx,
  updateOwnedTx,
} from '../inventory/index.js';
import { writeSyncScheduleRow } from '../sync/index.js';

export interface CleanupCounts {
  owned: { records: number; copies: number };
  manualStats: { records: number };
  character: { present: boolean; nick: string | null };
  journal: { events: number };
}

export function cleanupCounts(db: Db): CleanupCounts {
  const character = getCharacter(db);
  return {
    owned: character ? ownedCounts(db, character.id) : { records: 0, copies: 0 },
    manualStats: { records: character ? countCharacterStats(db, character.id, 'manual') : 0 },
    character: { present: character !== null, nick: character?.nick ?? null },
    journal: { events: eventCount(db) },
  };
}

/** Dispatches one of the five reset scopes. `inventory` stays the default scope. */
export function clearByScope(db: Db, scope: CleanupScope, dryRun: boolean): WriteResult {
  switch (scope) {
    case 'inventory':
      return clearOwned(db, dryRun);
    case 'manualStats':
      return clearManualStats(db, dryRun);
    case 'character':
      return deleteCharacterProfile(db, dryRun);
    case 'journal':
      return clearJournal(db, dryRun);
    case 'all':
      return resetAll(db, dryRun);
    default:
      throw new WriteError(400, 'VALIDATION', `Unknown cleanup scope "${String(scope)}"`);
  }
}

/* ------------------------------ cleanup ------------------------------ */

export function clearOwned(db: Db, dryRun: boolean): WriteResult {
  const character = characterOrThrow(db);
  const rows = listOwned(db, character.id);
  if (!rows.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = rows.map((row) => ownedCleanupSnapshot(db, row));
  const copies = rows.reduce((sum, row) => sum + row.qty, 0);
  const human = `Inventory cleared: ${rows.length} records, ${copies} copies`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    clearOwnedTx(db, character.id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'owned.clear',
      entity: 'owned',
      entityId: 'all',
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ manual stats ------------------------------ */

type StatSnapshot = CharacterDataSnapshot['stats'][number];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function manualStatsRows(db: Db, characterId: number): StatSnapshot[] {
  return listCharacterStats(db, characterId)
    .filter((stat) => stat.origin === 'manual')
    .map((stat) => ({
      statId: stat.stat_id,
      valueNum: stat.value_num,
      valueText: stat.value_text,
      origin: stat.origin,
      fetchedAt: stat.fetched_at,
    }));
}

export function clearManualStats(db: Db, dryRun: boolean): WriteResult {
  const character = characterOrThrow(db);
  const before = manualStatsRows(db, character.id);
  if (!before.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const human = `Manual stats cleared: ${plural(before.length, 'value', 'values')}`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    deleteManualStats(db, character.id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'character.stats.clear',
      entity: 'character',
      entityId: character.id,
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ character ------------------------------ */

interface CharacterProfileSnapshot extends CharacterDataSnapshot {
  owned: Record<string, unknown>[];
}

function characterProfileSnapshot(db: Db, row: ReturnType<typeof characterOrThrow>): CharacterProfileSnapshot {
  return {
    ...characterDataSnapshot(db, row),
    owned: listOwned(db, row.id).map((owned) => ownedCleanupSnapshot(db, owned)),
  };
}

/** Deletes the character row; owner gear and stats cascade with it. */
export function deleteCharacterProfile(db: Db, dryRun: boolean): WriteResult {
  const character = characterOrThrow(db);
  const before = characterProfileSnapshot(db, character);
  const human =
    `Character "${character.nick}" deleted: ` +
    `${plural(before.owned.length, 'owned record', 'owned records')}, ` +
    plural(before.stats.length, 'stat', 'stats');

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    deleteCharacter(db, character.id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'character.delete',
      entity: 'character',
      entityId: character.id,
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ journal ------------------------------ */

export function clearJournal(db: Db, dryRun: boolean): WriteResult {
  const events = snapshotEvents(db);
  if (!events.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = { count: events.length, events };
  const human = `Journal cleared: ${plural(events.length, 'event', 'events')}`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    replaceEvents(db, []);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'journal.clear',
      entity: 'journal',
      entityId: 'all',
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ full reset ------------------------------ */

export function resetAll(db: Db, dryRun: boolean): WriteResult {
  const character = getCharacter(db);
  const events = snapshotEvents(db);
  if (!character && !events.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const profile = character ? characterProfileSnapshot(db, character) : null;
  const before = { character: profile, events };
  const human =
    'Full reset: ' +
    (profile ? `character "${character!.nick}", ` : '') +
    `${plural(profile?.owned.length ?? 0, 'owned record', 'owned records')}, ` +
    `${plural(profile?.stats.length ?? 0, 'stat', 'stats')}, ` +
    plural(events.length, 'journal event', 'journal events');

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    if (character) deleteCharacter(db, character.id);
    replaceEvents(db, []);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'reset.all',
      entity: 'profile',
      entityId: 'all',
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

/* ------------------------------ rollback ------------------------------ */

export function rollbackEvent(db: Db, eventId: number, dryRun: boolean): WriteResult {
  const event = getEvent(db, eventId);
  if (!event) throw new WriteError(404, 'EVENT_NOT_FOUND', 'Event not found');

  const before = parseEventJson(event.after);
  const after = parseEventJson(event.before);
  const human = `Rollback of event #${eventId} (${event.action})`;

  if (dryRun) return { dryRun: true, diff: { before, after, human } };

  let rollbackId: number | undefined;
  withTransaction(db, () => {
    restoreSnapshot(db, event.action, after, before);
    rollbackId = logEvent(db, {
      actor: 'owner',
      action: 'rollback',
      entity: 'event',
      entityId: event.id,
      before,
      after,
      note: `Rollback of ${event.action}`,
    });
  });
  return { dryRun: false, diff: { before, after, human }, eventId: rollbackId };
}

function restoreStatsTx(db: Db, stats: StatSnapshot[], characterId: number): void {
  for (const stat of stats) {
    const value = stat.valueNum ?? stat.valueText;
    if (value == null) continue;
    setCharacterStat(db, characterId, stat.statId, value, stat.origin, stat.fetchedAt);
  }
}

function restoreCharacterProfileTx(db: Db, snapshot: CharacterProfileSnapshot | null | undefined): void {
  if (!snapshot?.character) return;
  restoreCharacterDataTx(db, { character: snapshot.character, stats: snapshot.stats ?? [] });
  for (const owned of snapshot.owned ?? []) restoreOwnedTx(db, owned, snapshot.character.id);
}

function restoreSnapshot(
  db: Db,
  action: string,
  target: any /* the state recorded in event.before */,
  produced: any /* the state recorded in event.after */,
): void {
  switch (action) {
    case 'owned.create': {
      if (target) restoreOwnedTx(db, target, characterOrThrow(db).id);
      else if (produced?.id) deleteOwnedTx(db, produced.id);
      return;
    }
    case 'owned.update': {
      updateOwnedTx(db, target);
      return;
    }
    case 'owned.delete': {
      restoreOwnedTx(db, target, characterOrThrow(db).id);
      return;
    }
    case 'owned.clear': {
      const characterId = characterOrThrow(db).id;
      for (const snapshot of (target as any[]) ?? []) restoreOwnedTx(db, snapshot, characterId);
      return;
    }
    case 'profile.clear': {
      // Legacy event from before builds were removed: only its inventory part can
      // still be restored, because the build tables no longer exist.
      const characterId = characterOrThrow(db).id;
      for (const snapshot of (target?.owned as any[]) ?? []) restoreOwnedTx(db, snapshot, characterId);
      return;
    }
    // Events written before the dossier -> profile rename keep their old action
    // name so the journal stays rollback-compatible.
    case 'dossier.clear': {
      const characterId = characterOrThrow(db).id;
      for (const snapshot of (target?.owned as any[]) ?? []) restoreOwnedTx(db, snapshot, characterId);
      return;
    }
    case 'character.stats.clear': {
      restoreStatsTx(db, (target as StatSnapshot[]) ?? [], characterOrThrow(db).id);
      return;
    }
    case 'character.delete': {
      restoreCharacterProfileTx(db, target as CharacterProfileSnapshot);
      return;
    }
    case 'journal.clear': {
      replaceEvents(db, (target?.events as EventSnapshotRow[]) ?? []);
      return;
    }
    case 'reset.all': {
      restoreCharacterProfileTx(db, target?.character as CharacterProfileSnapshot | null);
      replaceEvents(db, (target?.events as EventSnapshotRow[]) ?? []);
      return;
    }
    case 'container.fill': {
      restoreContainerFillTx(db, target);
      return;
    }
    case 'sync.schedule.update': {
      if (target) {
        writeSyncScheduleRow(db, {
          enabled: Boolean(target.enabled),
          catalogEveryMin: Number(target.catalogEveryMin),
          pricesEveryMin: Number(target.pricesEveryMin),
          profileEveryMin: Number(target.profileEveryMin),
        });
      }
      return;
    }
    case 'character.create': {
      const id = produced?.id;
      if (id == null) return;
      if (characterHasProfile(db, id)) {
        throw new WriteError(
          409,
          'CHARACTER_NOT_EMPTY',
          'Character has gear; remove it before rolling back its creation',
        );
      }
      deleteCharacter(db, id);
      return;
    }
    case 'character.update': {
      restoreCharacterTx(db, target, produced);
      return;
    }
    default:
      throw new WriteError(400, 'NOT_ROLLBACKABLE', `Event "${action}" cannot be rolled back`);
  }
}
