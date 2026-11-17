import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';

export interface SetupState {
  /** True until the dossier has its character. */
  needsSetup: boolean;
  catalogItems: number;
}

export function setupState(db: Db): SetupState {
  return { needsSetup: repo.getCharacter(db) === null, catalogItems: repo.countItems(db) };
}
