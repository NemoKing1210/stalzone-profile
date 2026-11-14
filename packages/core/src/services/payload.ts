import { CAT_RU, norm, rankKey, round } from '@dossier/shared';
import type { Db } from '../db/index.js';
import {
  armorAtLevel,
  displayDmg,
  displayDps,
  displayTtk,
  headMultiplier,
  protKeyFor,
  type WeaponStatLike,
} from '../calc/index.js';
import * as repo from '../repo/index.js';
import { itemStats, rawOf } from '../repo/items.js';
import type { ItemRow } from '../repo/items.js';
import type { OwnedJoined, ContainerFillRow } from '../repo/owned.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface PayloadFreshness {
  dataUpdated: string | null;
  pricesUpdatedAt: string | null;
  pricesAgeMin: number | null;
  sources: { id: string; status: string; lastOkAt: string | null; lastTryAt: string | null; lastError: string | null }[];
}

export interface Payload {
  meta: Json;
  character: Json;
  career: Json;
  weapons: Json[];
  armor: Json[];
  containers: Json[];
  artifacts: Json[];
  notes: Json[];
  catalog: { weapons: Json[]; armor: Json[]; meta: Json };
  recommendations: Json[];
  details: Record<string, Json>;
  earnings: Json;
  builds: Json;
  icons: Record<string, string>;
  freshness: PayloadFreshness;
}

interface StatRow extends WeaponStatLike {
  label: string | null;
  value_text: string | null;
  value_min: number | null;
  value_max: number | null;
  pct: number;
  positive: number | null;
  is_additional: number;
  source_id: string | null;
}

const SOURCE_PRIORITY: Record<string, number> = {
  wiki: 0,
  exbo_base: 1,
  scpmodel: 2,
  local: 3,
};

function statsOf(db: Db, itemId: number): StatRow[] {
  return itemStats(db, itemId) as unknown as StatRow[];
}

function preferred(rows: StatRow[], key: string, level?: number): StatRow | null {
  let pool = rows.filter((r) => r.key === key);
  if (!pool.length) return null;
  if (level != null) {
    const exact = pool.filter((r) => r.level === level);
    if (exact.length) pool = exact;
    else {
      const lower = pool.filter((r) => r.level < level).sort((a, b) => b.level - a.level);
      if (lower.length) pool = [lower[0]];
    }
  }
  return pool.sort((a, b) => (SOURCE_PRIORITY[a.source_id ?? ''] ?? 9) - (SOURCE_PRIORITY[b.source_id ?? ''] ?? 9))[0];
}

function valueAt(rows: StatRow[], key: string, level: number): number | null {
  return preferred(rows, key, level)?.value_num ?? null;
}

/** Exact level only: used for +15 values, where a lower level must not stand in. */
function valueExact(rows: StatRow[], key: string, level: number): number | null {
  const row = rows
    .filter((r) => r.key === key && r.level === level && r.value_num != null)
    .sort((a, b) => (SOURCE_PRIORITY[a.source_id ?? ''] ?? 9) - (SOURCE_PRIORITY[b.source_id ?? ''] ?? 9))[0];
  return row?.value_num ?? null;
}

function textAt(rows: StatRow[], key: string): string | null {
  return preferred(rows, key)?.value_text ?? null;
}

function slotRu(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/основн/i.test(value)) return 'основное';
  if (/вторичн/i.test(value)) return 'вторичное';
  return value;
}

function typeRu(item: ItemRow, raw: Json): string {
  return (
    CAT_RU[item.category ?? ''] ??
    raw?.details?.type ??
    raw?.catalog?.type ??
    raw?.ownedLegacy?.type ??
    (item.kind === 'armor' ? raw?.details?.cls : null) ??
    'Прочее'
  );
}

function clsRu(item: ItemRow, raw: Json): string {
  return CAT_RU[item.category ?? ''] ?? raw?.details?.cls ?? raw?.catalog?.cls ?? raw?.ownedLegacy?.cls ?? 'прочее';
}

function catShort(item: ItemRow, raw: Json): string | null {
  if (item.category?.includes('/')) return item.category.split('/')[1];
  return raw?.catalog?.cat ?? raw?.details?.cat ?? raw?.ownedLegacy?.cat ?? null;
}

function iconOf(item: ItemRow, raw: Json): string | null {
  return item.icon_path ?? raw?.catalog?.icon ?? raw?.details?.icon ?? raw?.icon ?? null;
}

function damageProfile(rows: StatRow[], raw: Json, level: number): Json | null {
  const d0 = valueAt(rows, 'damage.start', level);
  const dA = d0;
  const dB = valueAt(rows, 'damage.end', level);
  const distA = valueAt(rows, 'damage.decrease_start', level);
  const distB = valueAt(rows, 'damage.decrease_end', level);
  const distMax = valueAt(rows, 'damage.max_distance', level);
  if (d0 != null && dB != null && distA != null && distB != null && distMax != null) {
    return { d0, dA, dB, distA, distB, distMax };
  }
  const card = raw?.details;
  if (card) {
    const p = level >= 15 ? card.p15 : card.p0;
    if (p) return { ...p };
  }
  return null;
}

function weaponPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const raw = rawOf(item);
  const rows = statsOf(db, item.id);
  const level = owned.level;
  const extra = parseJson(owned.extra);
  const legacy = raw?.ownedLegacy ?? extra?.legacy;

  const rawDmg =
    valueAt(rows, 'damage.start', level) ?? legacy?.dmg ?? raw?.details?.p0?.d0 ?? raw?.catalog?.dmg15 ?? null;
  const rawDmg15 =
    valueExact(rows, 'damage.start', 15) ?? legacy?.dmg15 ?? raw?.details?.p15?.d0 ?? null;
  const rof =
    valueAt(rows, 'weapon.tooltip.weapon.info.rate_of_fire', level) ??
    valueAt(rows, 'weapon.tooltip.weapon.info.rate_of_fire', 15) ??
    legacy?.rof ??
    raw?.details?.rof ??
    raw?.catalog?.rof ??
    null;

  return {
    name: owned.display_name ?? item.name,
    skin: extra?.skin ?? null,
    slot: slotRu(owned.slot ?? item.slot) ?? null,
    lvl: level,
    mag:
      valueAt(rows, 'weapon.tooltip.weapon.info.clip_size', level) ??
      legacy?.mag ??
      raw?.details?.mag ??
      raw?.catalog?.mag ??
      null,
    weight: item.weight ?? legacy?.weight ?? raw?.details?.weight ?? raw?.catalog?.weight ?? null,
    role: owned.role ?? null,
    caliber:
      textAt(rows, 'kv:weapon.tooltip.weapon.info.ammo_type') ??
      legacy?.caliber ??
      raw?.details?.caliber ??
      raw?.catalog?.caliber ??
      null,
    cat: catShort(item, raw),
    dmg: displayDmg(rawDmg),
    rof,
    dps: displayDps(rawDmg, rof),
    spread:
      valueAt(rows, 'weapon.tooltip.weapon.info.spread', level) ??
      legacy?.spread ??
      raw?.details?.spread ??
      raw?.catalog?.spread ??
      null,
    recoil:
      valueAt(rows, 'weapon.tooltip.weapon.info.recoil', level) ??
      legacy?.recoil ??
      raw?.details?.recoil ??
      raw?.catalog?.recoil ??
      null,
    dist:
      valueAt(rows, 'weapon.tooltip.weapon.info.distance', level) ??
      legacy?.dist ??
      raw?.details?.distMax ??
      raw?.catalog?.dist ??
      null,
    type: typeRu(item, raw),
    rank: rankKey(item.rank) ?? legacy?.rank ?? raw?.catalog?.rank ?? raw?.details?.rank ?? null,
    dmg15: displayDmg(rawDmg15),
    dps15: displayDps(rawDmg15, rof),
    ttk: displayTtk(rawDmg, rof),
    ttk15: displayTtk(rawDmg15, rof),
    headMul: headMultiplier({ txt: raw?.details?.txt ?? raw?.exbo?.txt ?? null }),
    icon: iconOf(item, raw),
  };
}

function armorCurve(rows: StatRow[], raw: Json): number[] | null {
  const fromStats = rows
    .filter((r) => r.key === 'bullet_dmg_factor' && r.value_num != null)
    .sort((a, b) => a.level - b.level)
    .map((r) => r.value_num!) as number[];
  if (fromStats.length) return fromStats;
  if (Array.isArray(raw?.details?.curve)) return raw.details.curve as number[];
  return null;
}

function armorPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  if (!item) return { name: owned.item_name, lvl: owned.level, missing: true };
  const raw = rawOf(item);
  const rows = statsOf(db, item.id);
  const level = owned.level;
  const curve = armorCurve(rows, raw);
  const extra = parseJson(owned.extra);
  const legacy = raw?.ownedLegacy ?? extra?.legacy;

  const bullet =
    armorAtLevel(curve, level) ?? legacy?.armor ?? raw?.details?.prot?.bullet ?? null;
  const bullet15 =
    armorAtLevel(curve, 15) ?? legacy?.armor15 ?? raw?.details?.prot?.bullet15 ?? null;

  const prot: Record<string, number | null> = { bullet, bullet15 };
  for (const row of rows) {
    if (row.level !== 0) continue;
    const key = protKeyFor(row.key);
    if (!key || key === 'bullet') continue;
    if (prot[key] == null && row.value_num != null) prot[key] = row.value_num;
  }
  if (!Object.keys(prot).some((k) => k !== 'bullet' && k !== 'bullet15') && (raw?.details?.prot ?? legacy?.prot)) {
    for (const [key, value] of Object.entries(raw?.details?.prot ?? legacy?.prot ?? {})) {
      if (key === 'bullet' || key === 'bullet15') continue;
      if (typeof value === 'number') prot[key] = value;
    }
  }

  let mods = raw?.details?.mods ?? legacy?.mods;
  if (!Array.isArray(mods)) {
    mods = rows
      .filter((r) => r.level === 0 && r.value_num != null && !protKeyFor(r.key) && r.key !== 'core.tooltip.info.weight')
      .map((r) => ({ name: r.label ?? r.key, value: r.value_num, pct: !!r.pct }));
  }

  return {
    name: owned.display_name ?? owned.item_name,
    skin: extra?.skin ?? null,
    cls: clsRu(item, raw),
    weight: item.weight ?? legacy?.weight ?? raw?.details?.weight ?? null,
    lvl: level,
    armor: bullet,
    rank: rankKey(item.rank) ?? legacy?.rank ?? raw?.details?.rank ?? raw?.catalog?.rank ?? null,
    armor15: bullet15,
    prot,
    mods,
    icon: iconOf(item, raw),
  };
}

function containerPayload(db: Db, owned: OwnedJoined, fill: ContainerFillRow[]): Json {
  const item = repo.getItemById(db, owned.item_id);
  const raw = item ? rawOf(item) : {};
  const extra = parseJson(owned.extra);
  return {
    name: owned.display_name ?? owned.item_name,
    type: extra?.type ?? raw?.details?.type ?? 'контейнер',
    weight: extra?.weight ?? item?.weight ?? raw?.details?.weight ?? null,
    slots: extra?.slots ?? raw?.details?.slots ?? null,
    eff: extra?.eff ?? raw?.details?.eff ?? null,
    prot: extra?.prot ?? raw?.details?.prot ?? null,
    shield: extra?.shield ?? raw?.details?.shield ?? null,
    bonus: extra?.bonus ?? raw?.details?.bonus ?? null,
    rank: rankKey(item?.rank ?? extra?.rank) ?? extra?.rank ?? null,
    artifacts: fill.map((row) => ({ name: row.artifact_name ?? row.artifact_item_id, lvl: row.level })),
    artifactsAsOf: fill[0]?.as_of ?? null,
    icon: item?.icon_path ?? raw?.details?.icon ?? null,
  };
}

function artifactPayload(db: Db, owned: OwnedJoined): Json {
  const item = repo.getItemById(db, owned.item_id);
  const raw = item ? rawOf(item) : {};
  const extra = parseJson(owned.extra);
  return {
    name: owned.display_name ?? owned.item_name,
    type: extra?.type ?? CAT_RU[item?.category ?? ''] ?? raw?.details?.type ?? 'прочий',
    q: owned.quality ?? null,
    lvl: owned.level,
    effects: extra?.effects ?? artifactEffectsText(raw),
    rank: rankKey(item?.rank) ?? extra?.rank ?? 'default',
    icon: item?.icon_path ?? raw?.details?.icon ?? null,
  };
}

function artifactEffectsText(raw: Json): string {
  const stats = raw?.wiki?.stats ?? [];
  const labels = stats
    .filter((s: Json) => s?.is_positive !== false)
    .map((s: Json) => s?.name?.lines?.ru)
    .filter(Boolean);
  return labels.length ? labels.join(', ') : raw?.details?.effects ?? '';
}

function parseJson(value: string | null | undefined): Json {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function detailsMap(db: Db): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const item of repo.listItems(db)) {
    const card = rawOf(item)?.details;
    if (!card?.name || !card?.kind) continue;
    const prefix = card.kind === 'weapon' ? 'w' : card.kind === 'armor' ? 'a' : card.kind === 'artifact' ? 'art' : 'c';
    out[`${prefix}:${card.name}`] = card;
  }
  return out;
}

function catalogOf(db: Db, kind: 'weapon' | 'armor'): Json[] {
  const list: Json[] = [];
  for (const item of repo.listItems(db, kind)) {
    const raw = rawOf(item);
    if (raw?.catalog) list.push({ ...raw.catalog, icon: raw.catalog.icon ?? iconOf(item, raw) });
  }
  const order = repo.getMeta<string[]>(db, kind === 'weapon' ? 'catalog_order_weapons' : 'catalog_order_armor');
  if (Array.isArray(order)) {
    const index = new Map(order.map((name, i) => [norm(name), i]));
    list.sort((a, b) => (index.get(norm(a.name)) ?? 9999) - (index.get(norm(b.name)) ?? 9999));
  }
  return list;
}

function buildsOf(db: Db): Json {
  const meta = repo.blockPayload<Json>(repo.getBlock(db, 'builds_meta')) ?? {};
  const slots = repo.allBuildSlots(db);
  const items = repo.listBuilds(db).map((build) => {
    const container = build.container_item_id ? repo.getItemById(db, build.container_item_id) : null;
    const rows = (slots[build.id] ?? []).map((row) => ({
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
      metrics: parseJson(build.metrics) ?? [],
      rows,
      verdict: build.verdict,
    };
  });
  return {
    updated: meta.updated ?? null,
    priceNote: meta.priceNote ?? null,
    items,
    avoid: meta.avoid ?? [],
    current: meta.current ?? null,
  };
}

function characterPayload(db: Db, characterId?: number): Json {
  const c = repo.getCharacter(db, characterId);
  if (!c) return {};
  const meta = repo.getMeta<Json>(db, 'meta') ?? {};
  return {
    nick: c.nick,
    realm: /^ru$/i.test(c.realm) ? 'RU' : /^global$/i.test(c.realm) ? 'Global' : c.realm.toUpperCase(),
    alliance: c.alliance,
    faction: c.faction,
    clan: c.clan,
    arrived: c.arrived,
    hours: c.hours,
    kd: c.kd,
    accuracy: c.accuracy,
    headshot: c.headshot,
    achievements: c.achievements,
    achievementPoints: c.achievement_points,
    money: c.money,
    maxMoney: c.max_money,
    stash: c.stash,
    playstyle: c.playstyle,
    region: meta.region ?? null,
  };
}

function freshness(db: Db): PayloadFreshness {
  const latest = repo.latestPriceSnapshotAt(db);
  const ageMin = latest ? Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000)) : null;
  return {
    dataUpdated: repo.getMeta<Json>(db, 'meta')?.updated ?? null,
    pricesUpdatedAt: latest,
    pricesAgeMin: ageMin,
    sources: repo.listSources(db).map((s) => ({
      id: s.id,
      status: s.status,
      lastOkAt: s.last_ok_at,
      lastTryAt: s.last_try_at,
      lastError: s.last_error,
    })),
  };
}

export function buildPayload(db: Db, characterId?: number): Payload {
  const c = repo.getCharacter(db, characterId);
  if (!c) {
    return {
      meta: {},
      character: {},
      career: [],
      weapons: [],
      armor: [],
      containers: [],
      artifacts: [],
      notes: [],
      catalog: { weapons: [], armor: [], meta: {} },
      recommendations: [],
      details: {},
      earnings: null,
      builds: { updated: null, priceNote: null, items: [], avoid: [], current: null },
      icons: {},
      freshness: freshness(db),
    };
  }

  const owned = repo.listOwned(db, c.id);
  const fill = repo.allContainerFill(db, c.id);
  const character = characterPayload(db, c.id);
  const meta = repo.getMeta<Json>(db, 'meta') ?? {};

  return {
    meta,
    character,
    career: repo.getMeta<Json>(db, 'career') ?? [],
    weapons: owned.filter((o) => o.kind === 'weapon').map((o) => weaponPayload(db, o)),
    armor: owned.filter((o) => o.kind === 'armor').map((o) => armorPayload(db, o)),
    containers: owned.filter((o) => o.kind === 'container').map((o) => containerPayload(db, o, fill[o.id] ?? [])),
    artifacts: owned.filter((o) => o.kind === 'artifact').map((o) => artifactPayload(db, o)),
    notes: repo.listBlocks(db, 'notes').map((b) => repo.blockPayload(b) ?? {}),
    catalog: {
      weapons: catalogOf(db, 'weapon'),
      armor: catalogOf(db, 'armor'),
      meta: repo.blockPayload<Json>(repo.getBlock(db, 'catalog_meta')) ?? {},
    },
    recommendations: repo.listBlocks(db, 'recs').map((b) => repo.blockPayload(b) ?? {}),
    details: detailsMap(db),
    earnings: repo.blockPayload<Json>(repo.getBlock(db, 'earnings')),
    builds: buildsOf(db),
    icons: repo.iconMap(db),
    freshness: freshness(db),
  };
}

export function compareWeapons(db: Db, names: [string, string], level = 15): Json {
  const out = names.map((name) => {
    const item =
      repo.findItemByKindName(db, 'weapon', name) ?? repo.searchItems(db, { q: name, kind: 'weapon', limit: 1 })[0];
    if (!item) return { query: name, found: false };
    const rows = statsOf(db, item.id);
    const raw = rawOf(item);
    const rawDmg = valueExact(rows, 'damage.start', level) ?? raw?.details?.p15?.d0 ?? null;
    const rof =
      valueAt(rows, 'weapon.tooltip.weapon.info.rate_of_fire', level) ?? raw?.details?.rof ?? null;
    return {
      query: name,
      found: true,
      name: item.name,
      rank: rankKey(item.rank),
      type: typeRu(item, raw),
      dmg: displayDmg(rawDmg),
      rof,
      dps: displayDps(rawDmg, rof),
      ttk: displayTtk(rawDmg, rof),
      mag: valueAt(rows, 'weapon.tooltip.weapon.info.clip_size', level) ?? raw?.details?.mag ?? null,
      reload: valueAt(rows, 'weapon.tooltip.magazine.info.reload_time', level) ?? raw?.details?.reload ?? null,
      dist: valueAt(rows, 'weapon.tooltip.weapon.info.distance', level) ?? raw?.details?.distMax ?? null,
      spread: valueAt(rows, 'weapon.tooltip.weapon.info.spread', level) ?? raw?.details?.spread ?? null,
      recoil: valueAt(rows, 'weapon.tooltip.weapon.info.recoil', level) ?? raw?.details?.recoil ?? null,
      weight: item.weight ?? raw?.details?.weight ?? null,
      caliber: textAt(rows, 'kv:weapon.tooltip.weapon.info.ammo_type') ?? raw?.details?.caliber ?? null,
      icon: iconOf(item, raw),
    };
  });
  return out;
}

export function artifactSources(db: Db): Json[] {
  return repo
    .listItems(db, 'artifact')
    .map((item) => {
      const raw = rawOf(item);
      const stats = (raw?.wiki?.stats ?? []).map((s: Json) => mapArtifactStat(s, false));
      const additional = (raw?.wiki?.additionalStats ?? []).map((s: Json) => mapArtifactStat(s, true));
      return { exboId: item.exbo_id, name: item.name, type: CAT_RU[item.category ?? ''] ?? 'прочий', stats, additional };
    })
    .filter((a) => a.stats.length || a.additional.length);
}

function mapArtifactStat(stat: Json, additional: boolean): Json {
  const key = String(stat?.key ?? stat?.name?.key ?? '').replace('stalker.artefact_properties.factor.', '');
  const value = stat?.value ?? {};
  const min = typeof value.min === 'number' ? value.min : (value.calculated ?? 0);
  const max = typeof value.max === 'number' ? value.max : (value.calculated ?? 0);
  return {
    key,
    label: stat?.name?.lines?.ru ?? key,
    min,
    max,
    mid: round((min + max) / 2, 4),
    pos: stat?.is_positive !== false,
    pct: !!stat?.is_percentage,
    additional,
  };
}
