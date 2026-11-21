import type { ProfileExport } from '@profile/shared/contracts';
import type { Db } from '../../platform/db/index.js';
import { buildDetails } from '../catalog/index.js';
import { buildPayload } from './payload.js';

/**
 * Serializes the profile into the portable `profile.json` shape.
 * Display-only extras (`icons`, `freshness`) are intentionally dropped.
 */
export function exportProfileJson(db: Db, characterId?: number): ProfileExport {
  const payload = buildPayload(db, characterId);
  return {
    meta: payload.meta,
    character: payload.character,
    weapons: payload.weapons,
    armor: payload.armor,
    containers: payload.containers,
    artifacts: payload.artifacts,
    catalog: payload.catalog,
    inventory: payload.inventory,
    details: buildDetails(db),
  };
}
