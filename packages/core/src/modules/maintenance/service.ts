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
  characterHasDossier,
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
import {
  buildSnapshot,
  clearBuildsTx,
  countBuilds,
  deleteBuildTx,
  listBuilds,
  restoreBuildTx,
} from '../builds/index.js';

export interface CleanupCounts {
  owned: { records: number; copies: number };
  builds: number;
}

export function cleanupCounts(db: Db): CleanupCounts {
  const character = getCharacter(db);
  return {
    owned: character ? ownedCounts(db, character.id) : { records: 0, copies: 0 },
    builds: countBuilds(db),
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

export function clearBuilds(db: Db, dryRun: boolean): WriteResult {
  const builds = listBuilds(db);
  if (!builds.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = builds.map((build) => buildSnapshot(db, build.slug)).filter(Boolean);
  const human = `Builds cleared: ${builds.length}`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    clearBuildsTx(db);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'build.clear',
      entity: 'build',
      entityId: 'all',
      before,
      after: null,
    });
  });
  return { dryRun: false, diff: { before, after: null, human }, eventId };
}

export function clearAll(db: Db, dryRun: boolean): WriteResult {
  const character = getCharacter(db);
  const ownedRows = character ? listOwned(db, character.id) : [];
  const builds = listBuilds(db);
  if (!ownedRows.length && !builds.length) throw new WriteError(409, 'NOTHING_TO_CLEAR', 'Nothing to clear');

  const before = {
    owned: ownedRows.map((row) => ownedCleanupSnapshot(db, row)),
    builds: builds.map((build) => buildSnapshot(db, build.slug)).filter(Boolean),
  };
  const human = `All data cleared: ${ownedRows.length} inventory records, ${builds.length} builds`;

  if (dryRun) return { dryRun: true, diff: { before, after: null, human } };

  let eventId: number | undefined;
  withTransaction(db, () => {
    if (character) clearOwnedTx(db, character.id);
    clearBuildsTx(db);
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'dossier.clear',
      entity: 'dossier',
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
    case 'build.clear': {
      for (const snapshot of (target as any[]) ?? []) restoreBuildTx(db, snapshot);
      return;
    }
    case 'dossier.clear': {
      const characterId = characterOrThrow(db).id;
      for (const snapshot of (target?.owned as any[]) ?? []) restoreOwnedTx(db, snapshot, characterId);
      for (const snapshot of (target?.builds as any[]) ?? []) restoreBuildTx(db, snapshot);
      return;
    }
    case 'container.fill': {
      restoreContainerFillTx(db, target);
      return;
    }
    case 'build.save': {
      if (target) restoreBuildTx(db, target);
      else if (produced?.slug) deleteBuildTx(db, produced.slug);
      return;
    }
    case 'build.delete': {
      restoreBuildTx(db, target);
      return;
    }
    case 'character.create': {
      const id = produced?.id;
      if (id == null) return;
      if (characterHasDossier(db, id)) {
        throw new WriteError(
          409,
          'CHARACTER_NOT_EMPTY',
          'Character has gear or builds; remove them before rolling back its creation',
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
