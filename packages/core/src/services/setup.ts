import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';

export interface SetupState {
  /** True until the dossier has its character. */
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
  return { needsSetup: repo.getCharacter(db) === null, catalogItems: repo.countItems(db) };
}
