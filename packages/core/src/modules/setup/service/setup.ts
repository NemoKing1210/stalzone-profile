import type { Db } from '../../../platform/db/index.js';
import { countItems } from '../../catalog/index.js';
import { getCharacter } from '../../identity/index.js';

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
