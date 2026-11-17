import { NON_ROLLBACKABLE_ACTIONS, type CleanupScope, type LoggingSettings } from '@profile/shared/contracts';
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
  clearInventoryTx,
  deleteInventoryItemTx,
  deleteStorageTx,
  inventoryCleanupSnapshot,
  inventoryCounts,
  restoreAutoArrangeTx,
  restoreInventoryFillTx,
  restoreInventoryItemTx,
  restoreInventoryTx,
  restoreItemLayoutTx,
  restoreMoveTx,
  restoreStorageTx,
  restoreWeaponModuleTx,
  updateInventoryTx,
  updateStorageTx,
} from '../inventory/index.js';
import { writeSyncScheduleRow } from '../sync/index.js';
import { restoreLoggingSettingsTx } from '../logging/index.js';

export interface CleanupCounts {
  inventory: { items: number; storages: number; placements: number };
  manualStats: { records: number };
  character: { present: boolean; nick: string | null };
  journal: { events: number };
}

export function cleanupCounts(db: Db): CleanupCounts {
  const character = getCharacter(db);
  return {
    inventory: character ? inventoryCounts(db, character.id) : { items: 0, storages: 0, placements: 0 },
    manualStats: { records: character ? countCharacterStats(db, character.id, 'manual') : 0 },
    character: { present: character !== null, nick: character?.nick ?? null },
    journal: { events: eventCount(db) },
  };
}

/** Dispatches one of the five reset scopes. `inventory` stays the default scope. */
export function clearByScope(db: Db, scope: CleanupScope, dryRun: boolean): WriteResult {
  switch (scope) {
    case 'inventory':
      return clearInventory(db, dryRun);
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

/** Clears the instance-model inventory: storages, items and placements. */
export function clearInventory(db: Db, dryRun: boolean): WriteResult {
  const character = characterOrThrow(db);
  const counts = inventoryCounts(db, character.id);
  // The default inventory storage is part of the character, not of its content.
  if (!counts.items && !counts.placements && counts.storages <= 1) {
    throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');
  }

  const before = inventoryCleanupSnapshot(db, character.id);
  const human =
    `Inventory cleared: ${plural(counts.items, 'item', 'items')}, ` +
    plural(counts.storages, 'storage', 'storages');

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    clearInventoryTx(db, character.id);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'inventory.clear',
      entity: 'inventory',
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
  inventory: Record<string, unknown>;
}

function characterProfileSnapshot(db: Db, row: ReturnType<typeof characterOrThrow>): CharacterProfileSnapshot {
  return {
    ...characterDataSnapshot(db, row),
    inventory: inventoryCleanupSnapshot(db, row.id),
  };
}

/** Deletes the character row; owner gear and stats cascade with it. */
export function deleteCharacterProfile(db: Db, dryRun: boolean): WriteResult {
  const character = characterOrThrow(db);
  const before = characterProfileSnapshot(db, character);
  const human =
    `Character "${character.nick}" deleted: ` +
    `${plural((before.inventory.items as unknown[]).length, 'inventory item', 'inventory items')}, ` +
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
    `${plural((profile?.inventory.items as unknown[] | undefined)?.length ?? 0, 'inventory item', 'inventory items')}, ` +
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
  if ((NON_ROLLBACKABLE_ACTIONS as readonly string[]).includes(event.action)) {
    throw new WriteError(409, 'EVENT_NOT_ROLLBACKABLE', `Event #${eventId} (${event.action}) cannot be rolled back`);
  }

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
  if (snapshot.inventory) restoreInventoryTx(db, snapshot.inventory, snapshot.character.id);
}

/** Events written before the inventory redesign reference tables that no longer exist. */
const LEGACY_ROLLBACK_ACTIONS = new Set([
  'owned.create',
  'owned.update',
  'owned.delete',
  'owned.clear',
  'container.fill',
  'profile.clear',
  'dossier.clear',
]);

function restoreSnapshot(
  db: Db,
  action: string,
  target: any /* the state recorded in event.before */,
  produced: any /* the state recorded in event.after */,
): void {
  if (LEGACY_ROLLBACK_ACTIONS.has(action)) {
    throw new WriteError(
      409,
      'EVENT_NOT_ROLLBACKABLE',
      `Event "${action}" predates the inventory redesign and cannot be rolled back`,
    );
  }

  switch (action) {
    case 'inventory.clear': {
      restoreInventoryTx(db, target ?? {}, characterOrThrow(db).id);
      return;
    }
    case 'inventory.item.create': {
      if (target) updateInventoryTx(db, target);
      else if (produced?.id != null) deleteInventoryItemTx(db, produced.id);
      return;
    }
    case 'inventory.item.update': {
      updateInventoryTx(db, target);
      return;
    }
    case 'inventory.item.delete': {
      if (produced?.deleted) restoreInventoryItemTx(db, target, characterOrThrow(db).id);
      else updateInventoryTx(db, target);
      return;
    }
    case 'inventory.item.move': {
      restoreMoveTx(db, target, produced, characterOrThrow(db).id);
      return;
    }
    case 'inventory.item.module': {
      restoreWeaponModuleTx(db, target, characterOrThrow(db).id);
      return;
    }
    case 'inventory.storage.create': {
      if (produced?.id != null) deleteStorageTx(db, produced.id);
      return;
    }
    case 'inventory.storage.update': {
      updateStorageTx(db, target);
      return;
    }
    case 'inventory.storage.delete': {
      restoreStorageTx(db, target, characterOrThrow(db).id);
      return;
    }
    case 'inventory.container.fill': {
      restoreInventoryFillTx(db, target, characterOrThrow(db).id);
      return;
    }
    case 'inventory.autoArrange': {
      restoreAutoArrangeTx(db, produced, characterOrThrow(db).id);
      return;
    }
    case 'catalog.itemLayout.update': {
      restoreItemLayoutTx(db, target, produced);
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
    case 'logging.settings.update': {
      if (target) restoreLoggingSettingsTx(db, target as LoggingSettings);
      return;
    }
    case 'character.create': {
      const id = produced?.id;
      if (id == null) return;
      // The default storages are created with the character; only leftover gear blocks it.
      if (inventoryCounts(db, id).items > 0) {
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
