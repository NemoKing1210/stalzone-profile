import type { CharacterCreate } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { withTransaction, type WriteResult } from '../../../platform/journal/index.js';
import { countItems } from '../../catalog/index.js';
import { createCharacter, getCharacter } from '../../identity/index.js';
import { createStorage } from '../../inventory/index.js';

export interface SetupState {
  /** True until the profile has its character. */
  needsSetup: boolean;
  catalogItems: number;
}

const SETUP_REGIONS = new Set(['ru', 'eu', 'na', 'sea']);
export type SetupRegion = 'ru' | 'eu' | 'na' | 'sea';

/** The configured realm preselects the wizard only when the profile API serves it. */
export function defaultSetupRegion(realm: string | null | undefined): SetupRegion {
  return realm && SETUP_REGIONS.has(realm) ? (realm as SetupRegion) : 'ru';
}

export function setupState(db: Db): SetupState {
  return { needsSetup: getCharacter(db) === null, catalogItems: countItems(db) };
}

/**
 * Onboarding: creates the character together with its default storages in one
 * transaction. Characters that predate the redesign got the same storages from
 * the `0006_inventory_data.sql` migration, so onboarding and migration agree.
 */
export function createSetupCharacter(db: Db, input: CharacterCreate): WriteResult {
  if (input.dryRun) return createCharacter(db, input);

  let result: WriteResult | null = null;
  withTransaction(db, () => {
    result = createCharacter(db, input);
    createStorage(db, { kind: 'inventory', name: 'Inventory', width: 8, height: 8, dryRun: false });
    createStorage(db, { kind: 'stash', name: 'Stash', width: 8, height: 12, dryRun: false });
  });
  return result!;
}
