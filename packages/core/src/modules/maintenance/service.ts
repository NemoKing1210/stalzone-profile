import type { Db } from '../../platform/db/index.js';
import {
  getEvent,
  logEvent,
  parseEventJson,
  withTransaction,
  WriteError,
  type WriteResult,
} from '../../platform/journal/index.js';
import {
  characterHasProfile,
  characterOrThrow,
  deleteCharacter,
  getCharacter,
  restoreCharacterTx,
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
}

export function cleanupCounts(db: Db): CleanupCounts {
  const character = getCharacter(db);
  return {
    owned: character ? ownedCounts(db, character.id) : { records: 0, copies: 0 },
  };
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
