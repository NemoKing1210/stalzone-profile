import type { Db } from '../../platform/db/index.js';
import { buildCatalog, countItems, itemsByIds, latestPriceFetchedAt, loadCatalogContext } from '../catalog/index.js';
import { getCharacter, listCharacterStats } from '../identity/index.js';
import { loadInventorySnapshot, type InventorySnapshot } from '../inventory/service/loadout.js';
import { listSources } from '../sync/index.js';
import {
  catalogMeta,
  characterPayload,
  containerFills,
  containerPayload,
  freshness,
  newest,
  type PayloadFreshness,
} from './payload.js';

type Json = Record<string, unknown>;

/** `/api/v1/meta` without building cards, catalogs or inventory nodes. */
export function buildMetaSection(
  db: Db,
  characterId?: number,
): {
  meta: Json;
  catalogMeta: Json;
  freshness: PayloadFreshness;
} {
  const character = getCharacter(db, characterId);
  const sources = listSources(db);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const stats = character ? listCharacterStats(db, character.id) : [];
  const meta = catalogMeta(sourceById, countItems(db));
  return {
    meta: {
      ...meta,
      region: character?.region ?? null,
      statsFetched: newest(stats.map((stat) => stat.fetched_at)),
    },
    catalogMeta: meta,
    freshness: freshness(sources, latestPriceFetchedAt(db), character?.updated_at ?? null),
  };
}

/** `/api/v1/character`: the identity read model only. */
export function buildCharacterSection(db: Db, characterId?: number): Json {
  const character = getCharacter(db, characterId);
  if (!character) return {};
  return characterPayload(character, listCharacterStats(db, character.id));
}

function contextFor(db: Db, snapshot: InventorySnapshot) {
  const itemIds = [...new Set(snapshot.rows.map((row) => row.item_id))];
  return loadCatalogContext(db, [...itemsByIds(db, itemIds).values()]);
}

/** `/api/v1/containers`: the flat container rows from the instance model. */
export function buildContainersSection(db: Db, characterId?: number): Json[] {
  const character = getCharacter(db, characterId);
  if (!character) return [];
  const snapshot = loadInventorySnapshot(db, character.id);
  const rows = snapshot.rows.filter((row) => row.kind === 'container');
  if (!rows.length) return [];
  const ctx = contextFor(db, snapshot);
  const fills = containerFills(snapshot.rows, [...snapshot.placements.values()]);
  return rows.map((row) => containerPayload(ctx, row, snapshot.containers, fills, snapshot.placements));
}

/** `/api/v1/catalog`: one kind, no payload-wide context. */
export function buildCatalogSection(
  db: Db,
  kind: 'weapon' | 'armor' | 'device',
): Record<string, unknown>[] {
  return buildCatalog(db, kind);
}
