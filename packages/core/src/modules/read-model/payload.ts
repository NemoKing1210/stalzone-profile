import { CAT_RU, rankKey } from '@profile/shared';
import type { Payload } from '@profile/shared/contracts';
import { dataVersion, type Db } from '../../platform/db/index.js';
import {
  armorAtLevel,
  buildCardIndex,
  buildCatalogFrom,
  buildDeviceCatalogFrom,
  buildItemCardFrom,
  countItems,
  displayDmg,
  displayDps,
  displayTtk,
  headMultiplier,
  iconMapFrom,
  isDeviceCategory,
  itemText,
  itemValue,
  itemValueExact,
  itemsByIds,
  latestPriceFetchedAt,
  listItems,
  loadCatalogContext,
  protKeyFor,
  type CatalogContext,
  type ItemCardContext,
  type ItemRow,
  type ItemStatRow,
} from '../catalog/index.js';
import {
  getCharacter,
  getCharacterReadFrom,
  listCharacterStats,
  type CharacterRow,
  type CharacterStat,
} from '../identity/index.js';
import {
  inventoryRead,
  inventoryReadFrom,
  loadInventorySnapshot,
  placementRead,
  type ContainerDataRow,
  type InventoryItemJoined,
  type PlacementRow,
} from '../inventory/index.js';
import { listSources } from '../sync/index.js';

type Json = Record<string, any>;

export interface PayloadFreshness {
  dataUpdated: string | null;
  pricesUpdatedAt: string | null;
  pricesAgeMin: number | null;
  sources: { id: string; status: string; lastOkAt: string | null; lastTryAt: string | null; lastError: string | null }[];
}

const REFERENCE_SOURCES = ['exbo_base', 'wiki', 'motifs'] as const;
const CARD_KINDS: Record<string, true> = { weapon: true, armor: true, artifact: true, container: true };

export function newest(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > bestTime) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}

function slotRu(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/основн/i.test(value)) return 'основное';
  if (/вторичн/i.test(value)) return 'вторичное';
  return value;
}

function iconOf(ctx: CatalogContext, item: ItemRow | null): string | null {
  return item ? (ctx.icons.get(item.id) ?? null) : null;
}

export function catalogMeta(sources: Map<string, { last_ok_at: string | null }>, items: number): Json {
  const updated = newest(REFERENCE_SOURCES.map((id) => sources.get(id)?.last_ok_at ?? null));
  return {
    updated,
    source: sources.get('exbo_base')?.last_ok_at ? 'exbo_base' : '',
    items,
  };
}

/** Fields every flat row shares: the instance identity and where it currently sits. */
function instanceFields(item: InventoryItemJoined, placements: Map<number, PlacementRow>): Json {
  const placement = placements.get(item.id) ?? null;
  return {
    ownedId: item.id,
    instanceId: item.id,
    storageId: placement?.storage_id ?? null,
    placement: placementRead(placement),
  };
}

function weaponPayload(ctx: CatalogContext, owned: InventoryItemJoined, placements: Map<number, PlacementRow>): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const rows = ctx.stats.get(item.id) ?? [];
  const level = owned.level;
  const rawDmg = itemValue(rows, 'damage.start', level);
  const rawDmg15 = itemValueExact(rows, 'damage.start', 15);
  const rof =
    itemValue(rows, 'weapon.tooltip.weapon.info.rate_of_fire', level) ??
    itemValue(rows, 'weapon.tooltip.weapon.info.rate_of_fire', 15) ??
    null;

  return {
    ...instanceFields(owned, placements),
    name: owned.display_name ?? item.name,
    qty: owned.qty,
    note: owned.note,
    quality: owned.quality,
    skin: owned.skin_name,
    slot: slotRu(owned.slot ?? item.slot),
    lvl: level,
    mag: itemValue(rows, 'weapon.tooltip.weapon.info.clip_size', level),
    weight: item.weight,
    role: owned.role,
    caliber: itemText(rows, 'kv:weapon.tooltip.weapon.info.ammo_type'),
    cat: item.category?.includes('/') ? (item.category.split('/')[1] ?? null) : null,
    dmg: displayDmg(rawDmg),
    rof,
    dps: displayDps(rawDmg, rof),
    spread: itemValue(rows, 'weapon.tooltip.weapon.info.spread', level),
    recoil: itemValue(rows, 'weapon.tooltip.weapon.info.recoil', level),
    dist: itemValue(rows, 'weapon.tooltip.weapon.info.distance', level),
    type: CAT_RU[item.category ?? ''] ?? null,
    rank: rankKey(item.rank) ?? null,
    dmg15: displayDmg(rawDmg15),
    dps15: displayDps(rawDmg15, rof),
    ttk: displayTtk(rawDmg, rof),
    ttk15: displayTtk(rawDmg15, rof),
    headMul: headMultiplier({
      stats: { 'weapon.tooltip.weapon.info.head_damage_multiplier': itemValue(rows, 'weapon.tooltip.weapon.info.head_damage_multiplier') },
    }),
    icon: iconOf(ctx, item),
  };
}

function armorProtection(rows: ItemStatRow[], curve: number[] | null, level: number): Json {
  const prot: Record<string, number | null> = {
    bullet: armorAtLevel(curve, level),
    bullet15: armorAtLevel(curve, 15),
  };
  for (const row of rows) {
    if (row.level !== 0) continue;
    const key = protKeyFor(row.stat_id);
    if (!key || key === 'bullet') continue;
    if (prot[key] == null && row.value_num != null) prot[key] = row.value_num;
  }
  return prot;
}

function armorPayload(
  ctx: CatalogContext,
  cards: ItemCardContext,
  owned: InventoryItemJoined,
  placements: Map<number, PlacementRow>,
): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const rows = ctx.stats.get(item.id) ?? [];
  const card = buildItemCardFrom(cards, item);
  const curve = (card.curve as number[] | null) ?? null;

  return {
    ...instanceFields(owned, placements),
    name: owned.display_name ?? owned.item_name,
    qty: owned.qty,
    note: owned.note,
    quality: owned.quality,
    skin: owned.skin_name,
    cls: CAT_RU[item.category ?? ''] ?? null,
    weight: item.weight,
    lvl: owned.level,
    armor: armorAtLevel(curve, owned.level),
    rank: rankKey(item.rank) ?? null,
    armor15: armorAtLevel(curve, 15),
    prot: armorProtection(rows, curve, owned.level),
    mods: card.mods ?? [],
    icon: iconOf(ctx, item),
  };
}

export function containerPayload(
  ctx: CatalogContext,
  owned: InventoryItemJoined,
  overrides: Map<number, ContainerDataRow>,
  fills: Map<number, { name: string; lvl: number }[]>,
  placements: Map<number, PlacementRow>,
): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  const rows = item ? (ctx.stats.get(item.id) ?? []) : [];
  const override = overrides.get(owned.id) ?? null;
  const fill = fills.get(owned.id) ?? [];

  return {
    ...instanceFields(owned, placements),
    name: owned.display_name ?? owned.item_name,
    qty: owned.qty,
    note: owned.note,
    quality: owned.quality,
    skin: owned.skin_name,
    type: override?.type ?? null,
    weight: item?.weight ?? itemValue(rows, 'core.tooltip.info.weight'),
    slots: override?.slots ?? itemValue(rows, 'container.slots'),
    eff: override?.eff ?? itemValue(rows, 'container.effectiveness'),
    prot: override?.protection ?? itemValue(rows, 'container.protection'),
    shield: override?.shield ?? null,
    bonus: override?.bonus ?? null,
    rank: rankKey(item?.rank) ?? null,
    artifacts: fill,
    artifactsAsOf: null,
    icon: iconOf(ctx, item),
  };
}

function artifactPayload(
  ctx: CatalogContext,
  effectLabels: Map<number, string>,
  owned: InventoryItemJoined,
  placements: Map<number, PlacementRow>,
): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  const effects = effectLabels.get(owned.item_id) ?? '';
  return {
    ...instanceFields(owned, placements),
    name: owned.display_name ?? owned.item_name,
    qty: owned.qty,
    note: owned.note,
    quality: owned.quality,
    skin: owned.skin_name,
    type: CAT_RU[item?.category ?? ''] ?? 'прочий',
    q: owned.quality ?? null,
    lvl: owned.level,
    effects,
    rank: rankKey(item?.rank) ?? 'default',
    icon: iconOf(ctx, item),
  };
}

/** Container slots in slot order; the flat container row mirrors the placement tree. */
export function containerFills(
  items: InventoryItemJoined[],
  placements: PlacementRow[],
): Map<number, { name: string; lvl: number }[]> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const slots = new Map<number, { slot: number; name: string; lvl: number }[]>();
  for (const placement of placements) {
    if (placement.location !== 'container' || placement.container_item_id == null) continue;
    const child = byId.get(placement.item_id);
    if (!child) continue;
    const list = slots.get(placement.container_item_id) ?? [];
    list.push({ slot: placement.container_slot ?? 0, name: child.display_name ?? child.item_name, lvl: child.level });
    slots.set(placement.container_item_id, list);
  }
  return new Map(
    [...slots].map(([id, list]) => [
      id,
      list.sort((a, b) => a.slot - b.slot).map(({ name, lvl }) => ({ name, lvl })),
    ]),
  );
}

/** The character section is the identity read model without its surrogate id. */
export function characterPayload(character: CharacterRow, stats: CharacterStat[]): Json {
  const read = getCharacterReadFrom(character, stats);
  const { id: _id, ...rest } = read;
  return rest;
}

export function freshness(
  sources: ReturnType<typeof listSources>,
  latest: string | null,
  characterUpdatedAt: string | null,
): PayloadFreshness {
  const ageMin = latest ? Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000)) : null;
  return {
    dataUpdated: newest([...sources.map((source) => source.last_ok_at), characterUpdatedAt]),
    pricesUpdatedAt: latest,
    pricesAgeMin: ageMin,
    sources: sources.map((source) => ({
      id: source.id,
      status: source.status,
      lastOkAt: source.last_ok_at,
      lastTryAt: source.last_try_at,
      lastError: source.last_error,
    })),
  };
}

interface CachedPayload {
  version: number;
  at: number;
  payload: Payload;
}

const PAYLOAD_TTL_MS = 30_000;
const PAYLOAD_CACHE_LIMIT = 4;
const payloadCache = new WeakMap<Db, Map<string, CachedPayload>>();

/**
 * The read model is identical until the connection writes. Rebuild only when
 * `total_changes()` moves; the TTL refreshes clock-derived freshness fields.
 */
export function buildPayload(db: Db, characterId?: number): Payload {
  let cache = payloadCache.get(db);
  if (!cache) {
    cache = new Map();
    payloadCache.set(db, cache);
  }
  const key = characterId == null ? '*' : String(characterId);
  const version = dataVersion(db);
  const cached = cache.get(key);
  if (cached && cached.version === version && Date.now() - cached.at < PAYLOAD_TTL_MS) {
    return cached.payload;
  }

  const payload = buildPayloadUncached(db, characterId);
  cache.delete(key);
  cache.set(key, { version, at: Date.now(), payload });
  if (cache.size > PAYLOAD_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return payload;
}

function buildPayloadUncached(db: Db, characterId?: number): Payload {
  const character = getCharacter(db, characterId);
  const sources = listSources(db);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const latestPrice = latestPriceFetchedAt(db);

  if (!character) {
    return {
      meta: { updated: null, source: '', region: null, statsFetched: null },
      character: {},
      weapons: [],
      armor: [],
      containers: [],
      artifacts: [],
      catalog: { weapons: [], armor: [], devices: [], meta: { updated: null, source: '', items: 0 } },
      inventory: inventoryRead(db, characterId),
      details: {},
      icons: {},
      freshness: freshness(sources, latestPrice, null),
    } as Payload;
  }

  // Every gear row is one instance; the flat arrays are the table view over them.
  const snapshot = loadInventorySnapshot(db, character.id);
  const instances = snapshot.rows;
  const placements = snapshot.placements;
  const fills = containerFills(instances, [...placements.values()]);

  // One item/stat/icon/effect context serves details, both catalogs and every instance row.
  const catalogItems = listItems(db);
  const itemsById = new Map(catalogItems.map((item) => [item.id, item]));
  const missingIds = [...new Set(instances.map((row) => row.item_id))].filter((id) => !itemsById.has(id));
  if (missingIds.length) {
    for (const [id, item] of itemsByIds(db, missingIds)) itemsById.set(id, item);
  }
  // Details and catalogs only need the four card kinds; other catalog rows cost a full stats read.
  const instanceItemIds = new Set(instances.map((row) => row.item_id));
  const allItems = [...itemsById.values()].filter(
    (item) => CARD_KINDS[item.kind] === true || instanceItemIds.has(item.id) || isDeviceCategory(item.category),
  );
  const ctx: CatalogContext = loadCatalogContext(db, allItems);
  const cards = buildCardIndex(ctx);
  const catalogWeapons = buildCatalogFrom(ctx, 'weapon', cards.byId);
  const catalogArmor = buildCatalogFrom(ctx, 'armor', cards.byId);
  const catalogDevices = buildDeviceCatalogFrom(ctx, cards.byId);
  const stats = listCharacterStats(db, character.id);
  const meta = catalogMeta(sourceById, countItems(db));

  return {
    meta: {
      ...meta,
      region: character.region,
      statsFetched: newest(stats.map((stat) => stat.fetched_at)),
    },
    character: characterPayload(character, stats),
    weapons: instances.filter((row) => row.kind === 'weapon').map((row) => weaponPayload(ctx, row, placements)),
    armor: instances.filter((row) => row.kind === 'armor').map((row) => armorPayload(ctx, ctx, row, placements)),
    containers: instances
      .filter((row) => row.kind === 'container')
      .map((row) => containerPayload(ctx, row, snapshot.containers, fills, placements)),
    artifacts: instances
      .filter((row) => row.kind === 'artifact')
      .map((row) => artifactPayload(ctx, ctx.effects, row, placements)),
    catalog: {
      weapons: catalogWeapons,
      armor: catalogArmor,
      devices: catalogDevices,
      meta,
    },
    inventory: inventoryReadFrom(db, character.id, snapshot),
    details: cards.details,
    icons: iconMapFrom(allItems, ctx.icons),
    freshness: freshness(sources, latestPrice, character.updated_at),
  } as Payload;
}

export { artifactSources, compareWeapons } from '../catalog/index.js';
