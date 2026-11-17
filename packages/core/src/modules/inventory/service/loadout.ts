import type { ArtifactStat, ContainerLoadoutInput, LoadoutInput } from '../../catalog/index.js';
import {
  armorAtLevel,
  artifactSources,
  buildItemCard,
  getItemById,
  itemStats,
  protKeyFor,
  statValueBase,
} from '../../catalog/index.js';
import type { Db } from '../../../platform/db/index.js';
import { resolveWeight } from '../layout/index.js';
import * as repo from '../repo/index.js';

type PlacementMap = Map<number, repo.PlacementRow | null>;

function unitWeight(db: Db, row: repo.InventoryItemJoined): number | null {
  const layout = repo.getItemLayout(db, row.item_id);
  return resolveWeight(row.item_weight, layout?.weight ?? null);
}

function weightOf(db: Db, row: repo.InventoryItemJoined): number | null {
  const unit = unitWeight(db, row);
  return unit == null ? null : unit * row.qty;
}

function maxWeightBonus(db: Db, row: repo.InventoryItemJoined): number | null {
  return statValueBase(db, row.item_id, 'max_weight_bonus', row.level);
}

function armorProtection(db: Db, row: repo.InventoryItemJoined): Record<string, number | null> {
  const item = getItemById(db, row.item_id);
  if (!item) return {};
  const card = buildItemCard(db, item);
  const curve = (card.curve as number[] | null) ?? null;
  const prot: Record<string, number | null> = { bullet: armorAtLevel(curve, row.level) };
  for (const stat of itemStats(db, row.item_id)) {
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
export function gatherLoadout(db: Db, characterId: number): LoadoutInput {
  const rows = repo.listInventoryItems(db, characterId);
  const storages = new Map(repo.listStorages(db, characterId).map((storage) => [storage.id, storage]));
  const placements: PlacementMap = new Map(rows.map((row) => [row.id, repo.getPlacement(db, row.id)]));

  const stashMemo = new Map<number, boolean>();
  const inStash = (itemId: number, visiting = new Set<number>()): boolean => {
    const memo = stashMemo.get(itemId);
    if (memo !== undefined) return memo;
    if (visiting.has(itemId)) return false;
    visiting.add(itemId);
    const placement = placements.get(itemId);
    let result = false;
    if (placement?.location === 'grid') {
      result = placement.storage_id != null && storages.get(placement.storage_id)?.kind === 'stash';
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
      weights: contained.map((row) => weightOf(db, row)),
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
      armorSources.push({
        itemId: row.id,
        maxWeightBonus: maxWeightBonus(db, row),
        protection: isArmor ? armorProtection(db, row) : {},
      });
    }
    if (!isContainer) continue;

    const data = repo.getContainerData(db, row.id);
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

    containers.push({
      itemId: row.id,
      effectiveness: data?.eff ?? statValueBase(db, row.item_id, 'container.effectiveness', row.level),
      protection: data?.protection ?? statValueBase(db, row.item_id, 'container.protection', row.level),
      slots: data?.slots ?? statValueBase(db, row.item_id, 'container.slots', row.level),
      artifacts: artifacts.map((artifact) => artifactInput(artifact, stats)),
    });
  }

  return {
    armor: armorSources,
    containers,
    carriedWeights: carried.map((row) => weightOf(db, row)),
    storageWeights,
    allItemIds: carried.map((row) => String(row.id)),
  };
}
