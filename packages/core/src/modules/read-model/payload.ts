import { CAT_RU, rankKey } from '@dossier/shared';
import type { Payload } from '@dossier/shared/contracts';
import type { Db } from '../../platform/db/index.js';
import {
  armorAtLevel,
  buildCatalog,
  buildDetails,
  buildItemCard,
  countItems,
  displayDmg,
  displayDps,
  displayTtk,
  headMultiplier,
  iconMap,
  iconsByItemIds,
  itemText,
  itemValue,
  itemValueExact,
  itemsByIds,
  latestPriceFetchedAt,
  listItemEffects,
  protKeyFor,
  statsByItemIds,
  type ItemRow,
  type ItemStatRow,
} from '../catalog/index.js';
import { getCharacter, getCharacterRead, listCharacterStats } from '../identity/index.js';
import { allContainerSlots, getOwnedContainer, listOwned, type ContainerSlotRow, type OwnedJoined } from '../inventory/index.js';
import { listSources } from '../sync/index.js';

type Json = Record<string, any>;

export interface PayloadFreshness {
  dataUpdated: string | null;
  pricesUpdatedAt: string | null;
  pricesAgeMin: number | null;
  sources: { id: string; status: string; lastOkAt: string | null; lastTryAt: string | null; lastError: string | null }[];
}

const REFERENCE_SOURCES = ['exbo_base', 'wiki', 'motifs'] as const;

/** Catalog rows needed by every item card; loaded once per payload instead of per row. */
interface CatalogContext {
  items: Map<number, ItemRow>;
  stats: Map<number, ItemStatRow[]>;
  icons: Map<number, string>;
}

function newest(values: (string | null | undefined)[]): string | null {
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

function catalogMeta(sources: Map<string, { last_ok_at: string | null }>, items: number): Json {
  const updated = newest(REFERENCE_SOURCES.map((id) => sources.get(id)?.last_ok_at ?? null));
  return {
    updated,
    source: sources.get('exbo_base')?.last_ok_at ? 'exbo_base' : '',
    items,
  };
}

function weaponPayload(ctx: CatalogContext, owned: OwnedJoined): Json {
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
    name: owned.display_name ?? item.name,
    ownedId: owned.id,
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

function armorPayload(db: Db, ctx: CatalogContext, owned: OwnedJoined): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const rows = ctx.stats.get(item.id) ?? [];
  const card = buildItemCard(db, item);
  const curve = (card.curve as number[] | null) ?? null;

  return {
    name: owned.display_name ?? owned.item_name,
    ownedId: owned.id,
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

function containerPayload(
  db: Db,
  ctx: CatalogContext,
  owned: OwnedJoined,
  fills: Record<number, ContainerSlotRow[]>,
): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  const rows = item ? (ctx.stats.get(item.id) ?? []) : [];
  const override = getOwnedContainer(db, owned.id);
  const fill = fills[owned.id] ?? [];

  return {
    name: owned.display_name ?? owned.item_name,
    ownedId: owned.id,
    qty: owned.qty,
    note: owned.note,
    quality: owned.quality,
    skin: owned.skin_name,
    type: override?.container_type ?? null,
    weight: item?.weight ?? itemValue(rows, 'core.tooltip.info.weight'),
    slots: override?.slots ?? itemValue(rows, 'container.slots'),
    eff: override?.eff ?? itemValue(rows, 'container.effectiveness'),
    prot: override?.protection ?? itemValue(rows, 'container.protection'),
    shield: override?.shield ?? null,
    bonus: override?.bonus ?? null,
    rank: rankKey(item?.rank) ?? null,
    artifacts: fill.map((row) => ({ name: row.artifact_name ?? row.artifact_item_id, lvl: row.level })),
    artifactsAsOf: fill[0]?.as_of ?? null,
    icon: iconOf(ctx, item),
  };
}

function artifactPayload(db: Db, ctx: CatalogContext, owned: OwnedJoined): Json {
  const item = ctx.items.get(owned.item_id) ?? null;
  const effects = listItemEffects(db, owned.item_id)
    .map((effect) => effect.label)
    .join(', ');
  return {
    name: owned.display_name ?? owned.item_name,
    ownedId: owned.id,
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

/** Identical ownership rows are stored once with `qty`; the dossier shows one entry per copy. */
function expandOwned(rows: OwnedJoined[]): OwnedJoined[] {
  const out: OwnedJoined[] = [];
  for (const row of rows) {
    const copies = Math.max(1, Math.trunc(row.qty ?? 1));
    for (let i = 0; i < copies; i++) out.push(row);
  }
  return out;
}

/** The character section is the identity read model without its surrogate id. */
function characterPayload(db: Db, characterId?: number): Json {
  const read = getCharacterRead(db, characterId);
  if (!read) return {};
  const { id: _id, ...character } = read;
  return character;
}

function freshness(
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

export function buildPayload(db: Db, characterId?: number): Payload {
  const character = getCharacter(db, characterId);
  const sources = listSources(db);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const latestPrice = latestPriceFetchedAt(db);
  const currentCharacterUpdatedAt = getCharacter(db)?.updated_at ?? null;

  if (!character) {
    return {
      meta: { updated: null, source: '', region: null, statsFetched: null },
      character: {},
      weapons: [],
      armor: [],
      containers: [],
      artifacts: [],
      catalog: { weapons: [], armor: [], meta: { updated: null, source: '', items: 0 } },
      details: {},
      icons: {},
      freshness: freshness(sources, latestPrice, currentCharacterUpdatedAt),
    } as Payload;
  }

  const owned = expandOwned(listOwned(db, character.id));
  const itemIds = [...new Set(owned.map((row) => row.item_id))];
  const ctx: CatalogContext = {
    items: itemsByIds(db, itemIds),
    stats: statsByItemIds(db, itemIds),
    icons: iconsByItemIds(db, itemIds),
  };
  const catalogWeapons = buildCatalog(db, 'weapon');
  const catalogArmor = buildCatalog(db, 'armor');
  const stats = listCharacterStats(db, character.id);
  const meta = catalogMeta(sourceById, countItems(db));
  const fills = allContainerSlots(db, character.id);

  return {
    meta: {
      ...meta,
      region: character.region,
      statsFetched: newest(stats.map((stat) => stat.fetched_at)),
    },
    character: characterPayload(db, character.id),
    weapons: owned.filter((row) => row.kind === 'weapon').map((row) => weaponPayload(ctx, row)),
    armor: owned.filter((row) => row.kind === 'armor').map((row) => armorPayload(db, ctx, row)),
    containers: owned.filter((row) => row.kind === 'container').map((row) => containerPayload(db, ctx, row, fills)),
    artifacts: owned.filter((row) => row.kind === 'artifact').map((row) => artifactPayload(db, ctx, row)),
    catalog: {
      weapons: catalogWeapons,
      armor: catalogArmor,
      meta,
    },
    details: buildDetails(db),
    icons: iconMap(db),
    freshness: freshness(sources, latestPrice, currentCharacterUpdatedAt),
  } as Payload;
}

export { artifactSources, compareWeapons } from '../catalog/index.js';
