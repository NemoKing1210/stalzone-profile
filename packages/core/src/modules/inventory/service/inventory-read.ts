import type {
  ContainerDataRead,
  EquipmentRead,
  InventoryItemRead,
  InventoryRead,
  LoadoutStats,
  PlacementRead,
  RangeValue,
  StorageRead,
} from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { computeLoadout, statValueBaseFrom, type ItemStatRow, type LoadoutStats as ComputedLoadout } from '../../catalog/index.js';
import { getCharacter } from '../../identity/index.js';
import { resolveSize, resolveWeight } from '../layout/index.js';
import * as repo from '../repo/index.js';
import { isEquipmentSlot } from '../write/placement.js';
import { gatherLoadout, loadInventorySnapshot, type InventorySnapshot } from './loadout.js';

const MODULE_SLOTS = ['scope', 'muzzle', 'grip', 'magazine', 'stock', 'tactical', 'other'] as const;

function isModuleSlot(value: string): value is (typeof MODULE_SLOTS)[number] {
  return (MODULE_SLOTS as readonly string[]).includes(value);
}

function loose(): PlacementRead {
  return { location: 'loose' };
}

export function placementRead(placement: repo.PlacementRow | null): PlacementRead {
  if (!placement || placement.location === 'loose') return loose();
  if (placement.location === 'grid') {
    if (placement.storage_id == null || placement.x == null || placement.y == null) return loose();
    return {
      location: 'grid',
      storageId: placement.storage_id,
      x: placement.x,
      y: placement.y,
    };
  }
  if (placement.location === 'equipment') {
    if (!placement.equipment_slot || !isEquipmentSlot(placement.equipment_slot)) return loose();
    return { location: 'equipment', slot: placement.equipment_slot };
  }
  if (placement.location === 'container') {
    if (placement.container_item_id == null || placement.container_slot == null) return loose();
    return {
      location: 'container',
      containerItemId: placement.container_item_id,
      slotIndex: placement.container_slot,
    };
  }
  if (placement.location === 'weapon_module') {
    if (placement.weapon_item_id == null || !placement.module_slot || !isModuleSlot(placement.module_slot)) {
      return loose();
    }
    return {
      location: 'weapon_module',
      weaponItemId: placement.weapon_item_id,
      slot: placement.module_slot,
      verified: placement.verified === 1,
    };
  }
  return loose();
}

/**
 * Container values resolve field by field: an instance override wins, otherwise the
 * catalog stat applies (exact level, else level 0). No value at all stays null.
 */
function containerDataRead(
  row: repo.InventoryItemJoined,
  data: repo.ContainerDataRow | null,
  stats: ItemStatRow[],
): ContainerDataRead | null {
  const read: ContainerDataRead = {
    type: data?.type ?? null,
    shield: data?.shield ?? null,
    bonus: data?.bonus ?? null,
    protection: data?.protection ?? statValueBaseFrom(stats, 'container.protection', row.level),
    slots: data?.slots ?? statValueBaseFrom(stats, 'container.slots', row.level),
    eff: data?.eff ?? statValueBaseFrom(stats, 'container.effectiveness', row.level),
  };
  return Object.values(read).some((value) => value != null) ? read : null;
}

function emptyEquipment(): EquipmentRead {
  return {
    primary: null,
    secondary: null,
    melee: null,
    armor: null,
    backpack: null,
    container: null,
    quick1: null,
    quick2: null,
    quick3: null,
    quick4: null,
  };
}

function emptyRange(): RangeValue {
  return { min: 0, max: 0, value: 0, missing: [] };
}

interface NodeSet {
  rows: repo.InventoryItemJoined[];
  placements: Map<number, repo.PlacementRow>;
  nodes: Map<number, InventoryItemRead>;
}

function buildNodes(db: Db, characterId: number, snapshot?: InventorySnapshot): NodeSet {
  const snap = snapshot ?? loadInventorySnapshot(db, characterId);
  const { rows, placements, layouts, stats: itemStats, containers: containerOverrides } = snap;
  const nodes = new Map<number, InventoryItemRead>();

  for (const row of rows) {
    const layout = layouts.get(row.item_id) ?? null;
    const node: InventoryItemRead = {
      id: row.id,
      itemId: row.item_id,
      name: row.display_name ?? row.item_name,
      displayName: row.display_name,
      kind: row.kind as InventoryItemRead['kind'],
      category: row.category,
      rank: row.item_rank,
      level: row.level,
      quality: row.quality,
      rarityPct: row.rarity_pct,
      rarityTier: row.rarity_tier as InventoryItemRead['rarityTier'],
      qty: row.qty,
      virtual: row.is_virtual === 1,
      skinItemId: row.skin_item_id,
      icon: row.item_icon,
      slot: row.slot,
      weight: resolveWeight(row.item_weight, layout?.weight ?? null),
      size: resolveSize(row.kind, row.category, layout ? { width: layout.width, height: layout.height } : null),
      placement: placementRead(placements.get(row.id) ?? null),
      container:
        row.kind === 'container'
          ? containerDataRead(row, containerOverrides.get(row.id) ?? null, itemStats.get(row.item_id) ?? [])
          : null,
      artifacts: row.kind === 'container' ? [] : undefined,
      modules: row.kind === 'weapon' ? [] : undefined,
    };
    nodes.set(row.id, node);
  }

  for (const row of rows) {
    const placement = placements.get(row.id);
    if (!placement) continue;
    if (placement.location === 'container' && placement.container_item_id != null) {
      nodes.get(placement.container_item_id)?.artifacts?.push(nodes.get(row.id)!);
    } else if (placement.location === 'weapon_module' && placement.weapon_item_id != null) {
      nodes.get(placement.weapon_item_id)?.modules?.push(nodes.get(row.id)!);
    }
  }

  for (const node of nodes.values()) {
    node.artifacts?.sort((a, b) => {
      const slotA = placements.get(a.id)?.container_slot ?? 0;
      const slotB = placements.get(b.id)?.container_slot ?? 0;
      return slotA - slotB;
    });
    node.modules?.sort(
      (a, b) => MODULE_SLOTS.indexOf(a.placement.location === 'weapon_module' ? a.placement.slot : 'other') -
        MODULE_SLOTS.indexOf(b.placement.location === 'weapon_module' ? b.placement.slot : 'other'),
    );
  }

  return { rows, placements, nodes };
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

function toContractStats(loadout: ComputedLoadout): LoadoutStats {
  return {
    ...loadout,
    storages: Object.fromEntries(Object.entries(loadout.storages)) as Record<string, RangeValue>,
  };
}

function emptyInventoryRead(): InventoryRead {
  return {
    storages: [],
    equipment: emptyEquipment(),
    loose: [],
    stats: toContractStats(
      computeLoadout({ armor: [], containers: [], carriedWeights: [], storageWeights: [], allItemIds: [] }),
    ),
    updatedAt: null,
  };
}

/** The whole new-model inventory: storages, equipment, loose tray and computed loadout. */
export function inventoryRead(db: Db, characterId?: number): InventoryRead {
  const resolved = characterId ?? getCharacter(db)?.id ?? null;
  if (resolved == null) return emptyInventoryRead();
  return inventoryReadFrom(db, resolved, loadInventorySnapshot(db, resolved));
}

/** Same read model from a snapshot the caller already loaded (the payload uses one). */
export function inventoryReadFrom(db: Db, characterId: number, snapshot: InventorySnapshot): InventoryRead {
  const storageRows = snapshot.storages;
  if (!storageRows.some((storage) => storage.kind === 'inventory')) return emptyInventoryRead();

  const { rows, placements, nodes } = buildNodes(db, characterId, snapshot);
  const stats = toContractStats(computeLoadout(gatherLoadout(db, characterId, snapshot)));

  const storages: StorageRead[] = storageRows.map((storage) => {
    const items = rows
      .filter((row) => {
        const placement = placements.get(row.id);
        return placement?.location === 'grid' && placement.storage_id === storage.id;
      })
      .sort((a, b) => {
        const pa = placements.get(a.id);
        const pb = placements.get(b.id);
        return (pa?.y ?? 0) - (pb?.y ?? 0) || (pa?.x ?? 0) - (pb?.x ?? 0);
      })
      .map((row) => nodes.get(row.id)!);
    // Intake is infinite: the stored row keeps its base size, the read grows with the items.
    const effectiveHeight =
      storage.kind === 'overflow'
        ? Math.max(
            storage.height,
            ...items.map((item) =>
              item.placement.location === 'grid'
                ? item.placement.y + item.size.height
                : 0,
            ),
          )
        : storage.height;
    return {
      id: storage.id,
      kind: storage.kind,
      name: storage.name,
      width: storage.width,
      height: effectiveHeight,
      maxWeight: storage.max_weight,
      sortOrder: storage.sort_order,
      items,
      weight: stats.storages[String(storage.id)] ?? emptyRange(),
      updatedAt: storage.updated_at,
    };
  });

  const equipment = emptyEquipment();
  for (const row of rows) {
    const placement = placements.get(row.id);
    if (placement?.location !== 'equipment') continue;
    if (!placement.equipment_slot || !isEquipmentSlot(placement.equipment_slot)) continue;
    (equipment as unknown as Record<string, InventoryItemRead | null>)[placement.equipment_slot] =
      nodes.get(row.id)!;
  }

  const looseItems = rows
    .filter((row) => {
      const placement = placements.get(row.id);
      return !placement || placement.location === 'loose';
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.item_name.localeCompare(b.item_name) || a.id - b.id)
    .map((row) => nodes.get(row.id)!);

  return {
    storages,
    equipment,
    loose: looseItems,
    stats,
    updatedAt: newest([...storageRows.map((storage) => storage.updated_at), ...rows.map((row) => row.updated_at)]),
  };
}

export function inventoryItemRead(db: Db, itemId: number): InventoryItemRead | null {
  const row = repo.getInventoryItem(db, itemId);
  if (!row) return null;
  return buildNodes(db, row.character_id).nodes.get(itemId) ?? null;
}

export function inventoryCounts(
  db: Db,
  characterId: number,
): { items: number; storages: number; placements: number } {
  return {
    items: repo.listInventoryItems(db, characterId).length,
    storages: repo.listStorages(db, characterId).length,
    placements: repo.listPlacements(db, characterId).length,
  };
}

export function hasInventory(db: Db, characterId: number): boolean {
  return repo.getInventoryStorage(db, characterId) != null;
}
