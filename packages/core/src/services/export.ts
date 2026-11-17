import type { Db } from '../db/index.js';
import { buildPayload } from './payload.js';

type Json = any;

/**
 * Serializes the dossier into the portable `dossier.json` shape.
 * Display-only extras (`icons`, `freshness`) are intentionally dropped.
 */
export function exportDossierJson(db: Db, characterId?: number): Json {
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
