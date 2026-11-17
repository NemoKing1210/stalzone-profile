import { CAT_RU, RANK_ORDER, rankKey, round } from '@profile/shared';
import {
  armorAtLevel,
  displayDmg,
  displayDps,
  displayTtk,
  protKeyFor,
  type ArtifactSource,
  type ArtifactStat,
} from '../calc/index.js';
import type { Db } from '../../../platform/db/index.js';
import * as repo from '../repo/index.js';
import type { ItemRow, ItemStatRow } from '../repo/items.js';
import { sourcePriority } from '../source-priority.js';

export interface ItemCard {
  kind: string;
  name: string;
  icon: string | null;
  type: string | null;
  rank: string | null;
  slot: string | null;
  weight: number | null;
  caliber?: string | null;
  cls?: string | null;
  mag?: number | null;
  rof?: number | null;
  spread?: number | null;
  hipSpread?: number | null;
  recoil?: number | null;
  reload?: number | null;
  reloadTac?: number | null;
  ergonomics?: number | null;
  draw?: number | null;
  aim?: number | null;
  platePen?: number | null;
  pierce?: number | null;
  mods3?: { head: number | null; limbs: number | null };
  p0?: DamagePoint;
  p15?: DamagePoint;
  curve?: number[] | null;
  prot?: Record<string, number | null> | number | null;
  mods?: { name: string; value: number; pct: boolean }[];
  slots?: number | null;
  slotEq?: number | null;
  eff?: number | null;
  shield?: number | null;
  bonus?: string | null;
  effects?: string;
  [key: string]: unknown;
}

export interface DamagePoint {
  d0: number | null;
  dB: number | null;
  distA: number | null;
  distB: number | null;
  distMax: number | null;
}

export function preferredStat(rows: ItemStatRow[], statId: string, level?: number): ItemStatRow | null {
  let pool = rows.filter((row) => row.stat_id === statId);
  if (!pool.length) return null;
  if (level != null) {
    const exact = pool.filter((row) => row.level === level);
    if (exact.length) pool = exact;
    else {
      const lower = pool.filter((row) => row.level < level).sort((a, b) => b.level - a.level);
      const nearest = lower[0];
      if (nearest) pool = [nearest];
      else pool = [pool.sort((a, b) => a.level - b.level)[0]!];
    }
  }
  return pool.sort((a, b) => sourcePriority(a.source_id) - sourcePriority(b.source_id))[0] ?? null;
}

export function itemValue(rows: ItemStatRow[], statId: string, level?: number): number | null {
  return preferredStat(rows, statId, level)?.value_num ?? null;
}

/** Exact level only: +15 values must never stand in with a lower level. */
export function itemValueExact(rows: ItemStatRow[], statId: string, level: number): number | null {
  const row = rows
    .filter((r) => r.stat_id === statId && r.level === level && r.value_num != null)
    .sort((a, b) => sourcePriority(a.source_id) - sourcePriority(b.source_id))[0];
  return row?.value_num ?? null;
}

export function itemText(rows: ItemStatRow[], statId: string): string | null {
  return (
    rows
      .filter((row) => row.stat_id === statId && row.value_text != null)
      .sort((a, b) => sourcePriority(a.source_id) - sourcePriority(b.source_id))[0]?.value_text ?? null
  );
}

function damagePoint(rows: ItemStatRow[], level: number): DamagePoint {
  return {
    d0: itemValueExact(rows, 'damage.start', level),
    dB: itemValueExact(rows, 'damage.end', level),
    distA: itemValueExact(rows, 'damage.decrease_start', level),
    distB: itemValueExact(rows, 'damage.decrease_end', level),
    distMax: itemValueExact(rows, 'damage.max_distance', level),
  };
}

function effectsText(db: Db, itemId: number): string {
  return repo
    .listItemEffects(db, itemId)
    .map((effect) => effect.label)
    .join(', ');
}

function armorCurve(rows: ItemStatRow[]): number[] | null {
  const curve = rows
    .filter((row) => row.stat_id === 'bullet_dmg_factor' && row.value_num != null)
    .sort((a, b) => a.level - b.level)
    .map((row) => row.value_num!);
  return curve.length ? curve : null;
}

function armorMods(rows: ItemStatRow[]): { name: string; value: number; pct: boolean }[] {
  return rows
    .filter(
      (row) =>
        row.level === 0 &&
        row.value_num != null &&
        !protKeyFor(row.stat_id) &&
        row.stat_id !== 'core.tooltip.info.weight' &&
        !row.stat_id.startsWith('container.') &&
        row.stat_id !== 'damage.start',
    )
    .map((row) => ({ name: row.label ?? row.stat_id, value: row.value_num!, pct: row.pct === 1 }));
}

export function buildItemCard(db: Db, item: ItemRow): ItemCard {
  const rows = repo.itemStats(db, item.id);
  const icon = repo.getIcon(db, item.id)?.path ?? null;
  const base: ItemCard = {
    kind: item.kind,
    name: item.name,
    icon,
    type: CAT_RU[item.category ?? ''] ?? null,
    rank: rankKey(item.rank) ?? null,
    slot: item.slot,
    weight: item.weight,
    effects: effectsText(db, item.id),
  };

  if (item.kind === 'weapon') {
    const rof = itemValue(rows, 'weapon.tooltip.weapon.info.rate_of_fire', 15);
    return {
      ...base,
      caliber: itemText(rows, 'kv:weapon.tooltip.weapon.info.ammo_type'),
      mag: itemValue(rows, 'weapon.tooltip.weapon.info.clip_size'),
      rof: itemValue(rows, 'weapon.tooltip.weapon.info.rate_of_fire'),
      spread: itemValue(rows, 'weapon.tooltip.weapon.info.spread'),
      hipSpread: itemValue(rows, 'weapon.tooltip.weapon.info.hip_spread'),
      recoil: itemValue(rows, 'weapon.tooltip.weapon.info.recoil'),
      reload: itemValue(rows, 'weapon.tooltip.magazine.info.reload_time'),
      reloadTac: itemValue(rows, 'weapon.tooltip.magazine.info.reload_time_tactical'),
      ergonomics: itemValue(rows, 'weapon.stat_factor.reload_modifier'),
      draw: itemValue(rows, 'weapon.tooltip.weapon.info.draw_time'),
      aim: itemValue(rows, 'weapon.tooltip.weapon.info.aim_switch'),
      platePen: itemValue(rows, 'weapon.tooltip.weapon.info.plate_penetrating'),
      pierce: itemValue(rows, 'weapon.tooltip.weapon.info.piercing'),
      mods3: {
        head: itemValue(rows, 'weapon.tooltip.weapon.info.head_damage_multiplier'),
        limbs: itemValue(rows, 'weapon.tooltip.weapon.info.limbs_damage_multiplier'),
      },
      p0: damagePoint(rows, 0),
      p15: damagePoint(rows, 15),
      dps15: displayDps(itemValueExact(rows, 'damage.start', 15), rof),
      ttk15: displayTtk(itemValueExact(rows, 'damage.start', 15), rof),
    };
  }

  if (item.kind === 'armor') {
    const curve = armorCurve(rows);
    const prot: Record<string, number | null> = {
      bullet: armorAtLevel(curve, 0),
      bullet15: armorAtLevel(curve, 15),
    };
    for (const row of rows) {
      if (row.level !== 0) continue;
      const key = protKeyFor(row.stat_id);
      if (!key || key === 'bullet') continue;
      if (prot[key] == null && row.value_num != null) prot[key] = row.value_num;
    }
    return {
      ...base,
      cls: CAT_RU[item.category ?? ''] ?? null,
      curve,
      prot,
      mods: armorMods(rows),
      armor: armorAtLevel(curve, 0),
      armor15: armorAtLevel(curve, 15),
    };
  }

  if (item.kind === 'container') {
    const slots = itemValue(rows, 'container.slots');
    const eff = itemValue(rows, 'container.effectiveness');
    return {
      ...base,
      slots,
      eff,
      prot: itemValue(rows, 'container.protection'),
      slotEq: slots != null && eff != null ? round((slots * eff) / 100, 2) : itemValue(rows, 'container.slot_equivalent'),
      shield: null,
      bonus: null,
    };
  }

  if (item.kind === 'artifact') {
    return { ...base, type: CAT_RU[item.category ?? ''] ?? base.type };
  }

  return base;
}

export function cardKey(kind: string, name: string): string {
  const prefix = kind === 'weapon' ? 'w' : kind === 'armor' ? 'a' : kind === 'artifact' ? 'art' : 'c';
  return `${prefix}:${name}`;
}

export function buildDetails(db: Db): Record<string, ItemCard> {
  const out: Record<string, ItemCard> = {};
  for (const kind of ['weapon', 'armor', 'artifact', 'container']) {
    for (const item of repo.listItems(db, kind)) out[cardKey(kind, item.name)] = buildItemCard(db, item);
  }
  return out;
}

const RANK_INDEX = new Map<string, number>(RANK_ORDER.map((rank, index) => [rank, index]));

export function buildCatalog(db: Db, kind: 'weapon' | 'armor'): Record<string, unknown>[] {
  const entries = repo.listItems(db, kind).map((item) => {
    const card = buildItemCard(db, item);
    const row: Record<string, unknown> =
      kind === 'weapon'
        ? (() => {
            const damage15 = card.p15?.d0 ?? null;
            return {
              name: item.name,
              rank: card.rank ?? 'default',
              type: card.type ?? null,
              icon: card.icon,
              slot: item.slot,
              caliber: card.caliber ?? null,
              mag: card.mag ?? null,
              weight: item.weight,
              dmg15: damage15,
              rof: card.rof ?? null,
              dps15: displayDps(damage15, card.rof ?? null),
              ttk15: displayTtk(damage15, card.rof ?? null),
            };
          })()
        : {
            name: item.name,
            rank: card.rank ?? 'default',
            cls: card.cls ?? null,
            icon: card.icon,
            weight: item.weight,
            armor15: card.armor15 ?? null,
          };
    return { row, category: item.category ?? '', nameNorm: item.name_norm, rank: String(card.rank ?? 'default') };
  });

  entries.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category, 'ru');
    const rankA = RANK_INDEX.get(a.rank) ?? 99;
    const rankB = RANK_INDEX.get(b.rank) ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.nameNorm.localeCompare(b.nameNorm, 'ru', { numeric: true });
  });

  return entries.map((entry) => entry.row);
}

function compareIcon(db: Db, item: ItemRow): string | null {
  return repo.getIcon(db, item.id)?.path ?? null;
}

export function compareWeapons(
  db: Db,
  names: [string, string],
  level = 15,
): Record<string, unknown>[] {
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
      icon: compareIcon(db, item),
    };
  });
}

export function artifactSources(db: Db): ArtifactSource[] {
  const definitions = new Map(repo.listStatDefinitions(db).map((definition) => [definition.id, definition]));
  return repo
    .listItems(db, 'artifact')
    .map((item) => {
      const grouped = new Map<string, ItemStatRow[]>();
      for (const row of repo.itemStats(db, item.id)) {
        if (row.value_num == null && row.value_min == null && row.value_max == null) continue;
        const list = grouped.get(row.stat_id) ?? [];
        list.push(row);
        grouped.set(row.stat_id, list);
      }
      const stats: ArtifactStat[] = [];
      const additional: ArtifactStat[] = [];
      for (const [statId, rows] of grouped) {
        const label = rows.find((row) => row.label)?.label ?? definitions.get(statId)?.label_ru ?? statId;
        const explicitMin = rows.find((row) => row.value_min != null)?.value_min ?? null;
        const explicitMax = rows.find((row) => row.value_max != null)?.value_max ?? null;
        const numbers = rows.map((row) => row.value_num).filter((value): value is number => value != null);
        const min = explicitMin ?? (numbers.length ? Math.min(...numbers) : null);
        const max = explicitMax ?? (numbers.length ? Math.max(...numbers) : null);
        if (min == null || max == null) continue;
        const entry: ArtifactStat = {
          key: statId,
          label,
          min,
          max,
          mid: round((min + max) / 2, 4),
          pos: rows.every((row) => row.is_positive !== 0),
          pct: rows.some((row) => row.pct === 1),
          additional: rows.every((row) => row.is_additional === 1),
        };
        (entry.additional ? additional : stats).push(entry);
      }
      return {
        exboId: item.external_id,
        name: item.name,
        type: CAT_RU[item.category ?? ''] ?? 'прочий',
        stats,
        additional,
      };
    })
    .filter((source) => source.stats.length || source.additional.length);
}
