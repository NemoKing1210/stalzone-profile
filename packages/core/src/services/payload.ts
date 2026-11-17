import { CAT_RU, rankKey } from '@dossier/shared';
import { armorAtLevel, displayDmg, displayDps, displayTtk, headMultiplier, protKeyFor } from '../calc/index.js';
import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';
import type { ItemRow, ItemStatRow } from '../repo/items.js';
import type { OwnedJoined } from '../repo/owned.js';
import {
  artifactSources,
  buildCatalog,
  buildDetails,
  buildItemCard,
  itemText,
  itemValue,
  itemValueExact,
  type ItemCard,
} from './catalog-view.js';
import { deriveCharacterFields, effectiveCharacterStats } from './character-stats.js';

type Json = Record<string, any>;

export interface PayloadFreshness {
  dataUpdated: string | null;
  pricesUpdatedAt: string | null;
  pricesAgeMin: number | null;
  sources: { id: string; status: string; lastOkAt: string | null; lastTryAt: string | null; lastError: string | null }[];
}

export interface Payload {
  meta: Json;
  character: Json;
  weapons: Json[];
  armor: Json[];
  containers: Json[];
  artifacts: Json[];
  catalog: { weapons: Json[]; armor: Json[]; meta: Json };
  details: Record<string, ItemCard>;
  builds: { items: Json[] };
  icons: Record<string, string>;
  freshness: PayloadFreshness;
}

const REFERENCE_SOURCES = ['exbo_base', 'wiki', 'motifs'] as const;

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

function iconOf(db: Db, item: ItemRow | null): string | null {
  return item ? (repo.getIcon(db, item.id)?.path ?? null) : null;
}

function catalogMeta(db: Db, items: number): Json {
  const updated = newest(REFERENCE_SOURCES.map((id) => repo.getSource(db, id)?.last_ok_at ?? null));
  return {
    updated,
    source: repo.getSource(db, 'exbo_base')?.last_ok_at ? 'exbo_base' : '',
    items,
  };
}

function weaponPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const rows = repo.itemStats(db, item.id);
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
    icon: iconOf(db, item),
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

function armorPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const rows = repo.itemStats(db, item.id);
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
    icon: iconOf(db, item),
  };
}

function containerPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  const rows = item ? repo.itemStats(db, item.id) : [];
  const override = repo.getOwnedContainer(db, owned.id);
  const fill = repo.listContainerSlots(db, owned.id);

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
    icon: iconOf(db, item ?? null),
  };
}

function artifactPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  const effects = repo
    .listItemEffects(db, owned.item_id)
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
    icon: iconOf(db, item ?? null),
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

function buildsOf(db: Db): { items: Json[] } {
  const items = repo.listBuilds(db).map((build) => {
    const container = build.container_item_id ? repo.getItemById(db, build.container_item_id) : null;
    const slots = repo.listBuildSlots(db, build.id).map((row) => ({
      name: row.item_name ?? row.label ?? '—',
      q: row.quality ?? null,
      price: row.price ?? null,
      lots: row.lots ?? null,
      eff: row.eff ?? null,
      bonus: row.bonus ?? null,
      minus: row.minus ?? null,
      why: row.why ?? null,
      rank: rankKey(row.item_rank ?? row.rank) ?? row.rank ?? 'default',
    }));
    return {
      id: build.slug,
      short: build.short,
      tag: build.tag,
      title: build.title,
      goal: build.goal,
      container: container?.name ?? null,
      slots: build.slots,
      eff: build.eff,
      budget: build.budget,
      total: build.total,
      metrics: repo.listBuildMetrics(db, build.id).map((metric) => ({
        l: metric.label,
        v: metric.value,
        s: metric.sub,
      })),
      rows: slots,
      verdict: build.verdict,
    };
  });
  return { items };
}

function characterPayload(db: Db, characterId?: number): Json {
  const character = repo.getCharacter(db, characterId);
  if (!character) return {};
  const rows = repo.listCharacterStats(db, character.id);
  const effective = effectiveCharacterStats(rows);
  const values: Json = {};
  for (const [statId, stat] of Object.entries(effective)) values[statId] = stat.value;

  return {
    nick: character.nick,
    region: character.region,
    faction: character.faction,
    alliance: character.alliance,
    clanName: character.clan_name,
    clanRank: character.clan_rank,
    money: character.money,
    maxMoney: character.max_money,
    stash: character.stash,
    playstyle: character.playstyle,
    ...deriveCharacterFields(effective),
    stats: values,
  };
}

function freshness(db: Db): PayloadFreshness {
  const latest = repo.latestPriceFetchedAt(db);
  const ageMin = latest ? Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000)) : null;
  return {
    dataUpdated: newest([
      ...repo.listSources(db).map((source) => source.last_ok_at),
      repo.getCharacter(db)?.updated_at ?? null,
    ]),
    pricesUpdatedAt: latest,
    pricesAgeMin: ageMin,
    sources: repo.listSources(db).map((source) => ({
      id: source.id,
      status: source.status,
      lastOkAt: source.last_ok_at,
      lastTryAt: source.last_try_at,
      lastError: source.last_error,
    })),
  };
}

export function buildPayload(db: Db, characterId?: number): Payload {
  const character = repo.getCharacter(db, characterId);
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
      builds: { items: [] },
      icons: {},
      freshness: freshness(db),
    };
  }

  const owned = expandOwned(repo.listOwned(db, character.id));
  const catalogWeapons = buildCatalog(db, 'weapon');
  const catalogArmor = buildCatalog(db, 'armor');
  const stats = repo.listCharacterStats(db, character.id);

  return {
    meta: {
      ...catalogMeta(db, repo.countItems(db)),
      region: character.region,
      statsFetched: newest(stats.map((stat) => stat.fetched_at)),
    },
    character: characterPayload(db, character.id),
    weapons: owned.filter((row) => row.kind === 'weapon').map((row) => weaponPayload(db, row)),
    armor: owned.filter((row) => row.kind === 'armor').map((row) => armorPayload(db, row)),
    containers: owned.filter((row) => row.kind === 'container').map((row) => containerPayload(db, row)),
    artifacts: owned.filter((row) => row.kind === 'artifact').map((row) => artifactPayload(db, row)),
    catalog: {
      weapons: catalogWeapons,
      armor: catalogArmor,
      meta: catalogMeta(db, repo.countItems(db)),
    },
    details: buildDetails(db),
    builds: buildsOf(db),
    icons: repo.iconMap(db),
    freshness: freshness(db),
  };
}

export function compareWeapons(db: Db, names: [string, string], level = 15): Json {
  return names.map((name) => {
    const item =
      repo.findItemByKindName(db, 'weapon', name) ?? repo.searchItems(db, { q: name, kind: 'weapon', limit: 1 })[0];
    if (!item) return { query: name, found: false };
    const rows = repo.itemStats(db, item.id);
    const damage = itemValueExact(rows, 'damage.start', level);
    const rof = itemValue(rows, 'weapon.tooltip.weapon.info.rate_of_fire', level);
    return {
      query: name,
      found: true,
      name: item.name,
      rank: rankKey(item.rank),
      type: CAT_RU[item.category ?? ''] ?? null,
      dmg: displayDmg(damage),
      rof,
      dps: displayDps(damage, rof),
      ttk: displayTtk(damage, rof),
      mag: itemValue(rows, 'weapon.tooltip.weapon.info.clip_size', level),
      reload: itemValue(rows, 'weapon.tooltip.magazine.info.reload_time', level),
      dist: itemValue(rows, 'weapon.tooltip.weapon.info.distance', level),
      spread: itemValue(rows, 'weapon.tooltip.weapon.info.spread', level),
      recoil: itemValue(rows, 'weapon.tooltip.weapon.info.recoil', level),
      weight: item.weight,
      caliber: itemText(rows, 'kv:weapon.tooltip.weapon.info.ammo_type'),
      icon: iconOf(db, item),
    };
  });
}

export { artifactSources };
