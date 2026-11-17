import type { DossierExport } from '@dossier/shared/contracts';
import type { Db } from '../../platform/db/index.js';
import { buildPayload } from './payload.js';

/**
 * Serializes the dossier into the portable `dossier.json` shape.
 * Display-only extras (`icons`, `freshness`) are intentionally dropped.
 */
export function exportDossierJson(db: Db, characterId?: number): DossierExport {
  const payload = buildPayload(db, characterId);
  return {
    meta: payload.meta,
    character: payload.character,
    weapons: payload.weapons,
    armor: payload.armor,
    containers: payload.containers,
    artifacts: payload.artifacts,
    catalog: payload.catalog,
    details: payload.details,
    builds: payload.builds,
  };
}
