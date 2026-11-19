import {
  armorAtLevel,
  armorCurve,
  artifactSources,
  protKeyFor,
  statValueBaseFrom,
  statsByItemIds,
  type ArtifactStat,
  type ContainerLoadoutInput,
  type ItemStatRow,
  type LoadoutInput,
} from '../../catalog/index.js';
import type { Db } from '../../../platform/db/index.js';
import { resolveWeight } from '../layout/index.js';
import * as repo from '../repo/index.js';

type PlacementMap = ReadonlyMap<number, repo.PlacementRow | undefined>;

/** Everything the inventory read model and the loadout calculation share for one character. */
export interface InventorySnapshot {
  rows: repo.InventoryItemJoined[];
  placements: Map<number, repo.PlacementRow>;
  storages: repo.StorageRow[];
  layouts: Map<number, repo.ItemLayoutRow>;
  stats: Map<number, ItemStatRow[]>;
  containers: Map<number, repo.ContainerDataRow>;
}

/** Loads the six inventory tables once; every read over the same character reuses it. */
export function loadInventorySnapshot(db: Db, characterId: number): InventorySnapshot {
  const rows = repo.listInventoryItems(db, characterId);
  const itemIds = [...new Set(rows.map((row) => row.item_id))];
  return {
    rows,
    placements: new Map(repo.listPlacements(db, characterId).map((row) => [row.item_id, row])),
    storages: repo.listStorages(db, characterId),
    layouts: repo.itemLayoutsByItemIds(db, itemIds),
    stats: statsByItemIds(db, itemIds),
    containers: repo.containerDataByItemIds(
      db,
      rows.filter((row) => row.kind === 'container').map((row) => row.id),
    ),
  };
}

function unitWeight(row: repo.InventoryItemJoined, layouts: Map<number, repo.ItemLayoutRow>): number | null {
  const layout = layouts.get(row.item_id) ?? null;
  return resolveWeight(row.item_weight, layout?.weight ?? null);
}

function weightOf(row: repo.InventoryItemJoined, layouts: Map<number, repo.ItemLayoutRow>): number | null {
  const unit = unitWeight(row, layouts);
  return unit == null ? null : unit * row.qty;
}

function maxWeightBonus(row: repo.InventoryItemJoined, stats: ItemStatRow[]): number | null {
  return statValueBaseFrom(stats, 'max_weight_bonus', row.level);
}

function armorProtection(row: repo.InventoryItemJoined, stats: ItemStatRow[]): Record<string, number | null> {
  const curve = armorCurve(stats);
  const prot: Record<string, number | null> = { bullet: armorAtLevel(curve, row.level) };
  for (const stat of stats) {
    if (stat.level !== 0) continue;
    const key = protKeyFor(stat.stat_id);
    if (!key || key === 'bullet') continue;
    if (prot[key] == null && stat.value_num != null) prot[key] = stat.value_num;
  }
  return prot;
}

function artifactStatMap(db: Db): Map<string, ArtifactStat[]> {
  const out = new Map<string, ArtifactStat[]>();
  for (const source of artifactSources(db)) {
    out.set(source.exboId, [...source.stats, ...source.additional]);
  }
  return out;
}

function artifactInput(
  row: repo.InventoryItemJoined,
  stats: Map<string, ArtifactStat[]>,
): ContainerLoadoutInput['artifacts'][number] {
  return {
    itemId: row.id,
    name: row.display_name ?? row.item_name,
    level: row.level,
    rarityPct: row.rarity_pct,
    rarityTier: row.rarity_tier,
    stats: stats.get(row.external_id) ?? [],
  };
}

/**
 * Turns the stored instances into the pure loadout input: carried weights, per-storage
 * weights, equipped armor/containers and their artifact children. Weights follow the
 * placement tree so a container's contents are counted exactly once.
 */
export function gatherLoadout(
  db: Db,
  characterId: number,
  snapshot?: InventorySnapshot,
): LoadoutInput {
  const snap = snapshot ?? loadInventorySnapshot(db, characterId);
  const rows = snap.rows;
  const storages = new Map(snap.storages.map((storage) => [storage.id, storage]));
  const placements: PlacementMap = snap.placements;
  const layouts = snap.layouts;
  const statsById = snap.stats;
  const overrides = snap.containers;

  const stashMemo = new Map<number, boolean>();
  const inStash = (itemId: number, visiting = new Set<number>()): boolean => {
    const memo = stashMemo.get(itemId);
    if (memo !== undefined) return memo;
    if (visiting.has(itemId)) return false;
    visiting.add(itemId);
    const placement = placements.get(itemId);
    let result = false;
    if (placement?.location === 'grid') {
      result =
        placement.storage_id != null &&
        ['stash', 'overflow'].includes(storages.get(placement.storage_id)?.kind ?? '');
    } else if (placement?.location === 'container' && placement.container_item_id != null) {
      result = inStash(placement.container_item_id, visiting);
    } else if (placement?.location === 'weapon_module' && placement.weapon_item_id != null) {
      result = inStash(placement.weapon_item_id, visiting);
    }
    stashMemo.set(itemId, result);
    return result;
  };

  const inStorage = (itemId: number, storageId: number, visiting = new Set<number>()): boolean => {
    if (visiting.has(itemId)) return false;
    visiting.add(itemId);
    const placement = placements.get(itemId);
    if (!placement) return false;
    if (placement.location === 'grid') return placement.storage_id === storageId;
    if (placement.location === 'container' && placement.container_item_id != null) {
      return inStorage(placement.container_item_id, storageId, visiting);
    }
    if (placement.location === 'weapon_module' && placement.weapon_item_id != null) {
      return inStorage(placement.weapon_item_id, storageId, visiting);
    }
    return false;
  };

  const carried = rows.filter((row) => !inStash(row.id));
  const storageWeights = [...storages.values()].map((storage) => {
    const contained = rows.filter((row) => inStorage(row.id, storage.id));
    return {
      storageId: storage.id,
      weights: contained.map((row) => weightOf(row, layouts)),
      ids: contained.map((row) => row.id),
    };
  });

  const stats = artifactStatMap(db);
  const armorSources: LoadoutInput['armor'] = [];
  const containers: ContainerLoadoutInput[] = [];

  for (const row of rows) {
    const placement = placements.get(row.id);
    if (placement?.location !== 'equipment') continue;
    const slot = placement.equipment_slot;
    const isArmor = row.kind === 'armor' || slot === 'backpack';
    const isContainer = row.kind === 'container' && (slot === 'backpack' || slot === 'container');
    if (isArmor || isContainer) {
      const itemStats = statsById.get(row.item_id) ?? [];
      armorSources.push({
        itemId: row.id,
        maxWeightBonus: maxWeightBonus(row, itemStats),
        protection: isArmor ? armorProtection(row, itemStats) : {},
      });
    }
    if (!isContainer) continue;

    const data = overrides.get(row.id) ?? null;
    const artifacts = rows
      .filter((candidate) => {
        const childPlacement = placements.get(candidate.id);
        return (
          childPlacement?.location === 'container' && childPlacement.container_item_id === row.id
        );
      })
      .sort((a, b) => {
        const slotA = placements.get(a.id)?.container_slot ?? 0;
        const slotB = placements.get(b.id)?.container_slot ?? 0;
        return slotA - slotB;
      });

    const containerStats = statsById.get(row.item_id) ?? [];
    containers.push({
      itemId: row.id,
      effectiveness: data?.eff ?? statValueBaseFrom(containerStats, 'container.effectiveness', row.level),
      protection: data?.protection ?? statValueBaseFrom(containerStats, 'container.protection', row.level),
      slots: data?.slots ?? statValueBaseFrom(containerStats, 'container.slots', row.level),
      artifacts: artifacts.map((artifact) => artifactInput(artifact, stats)),
    });
  }

  return {
    armor: armorSources,
    containers,
    carriedWeights: carried.map((row) => weightOf(row, layouts)),
    storageWeights,
    allItemIds: carried.map((row) => String(row.id)),
  };
}
