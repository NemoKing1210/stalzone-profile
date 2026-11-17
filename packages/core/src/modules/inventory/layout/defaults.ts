export interface Size {
  width: number;
  height: number;
}

const WEAPON_SIZES: Record<string, Size> = {
  'weapon/assault_rifle': { width: 5, height: 2 },
  'weapon/machine_gun': { width: 6, height: 2 },
  'weapon/sniper_rifle': { width: 6, height: 2 },
  'weapon/shotgun_rifle': { width: 5, height: 2 },
  'weapon/submachine_gun': { width: 4, height: 2 },
  'weapon/pistol': { width: 2, height: 2 },
  'weapon/melee': { width: 2, height: 2 },
  'weapon/heavy': { width: 7, height: 3 },
  'weapon/device': { width: 2, height: 2 },
  'weapon/other': { width: 4, height: 2 },
};

const ARMOR_SIZE: Size = { width: 3, height: 3 };
const CONTAINER_SIZE: Size = { width: 3, height: 3 };
const ONE_CELL: Size = { width: 1, height: 1 };

/**
 * Category defaults from the design. The category string is the catalog value
 * (`weapon/assault_rifle`, `armor/combat`, ...); a missing or unknown category
 * falls back to the kind, then to one cell.
 */
export function defaultSize(kind: string, category: string | null): Size {
  if (kind === 'weapon') {
    const size = category ? WEAPON_SIZES[category] : undefined;
    if (size) return size;
    return WEAPON_SIZES['weapon/other'] ?? ONE_CELL;
  }
  if (kind === 'armor') return ARMOR_SIZE;
  if (kind === 'container') return CONTAINER_SIZE;
  return ONE_CELL;
}

export function resolveSize(kind: string, category: string | null, override: Size | null): Size {
  return override ?? defaultSize(kind, category);
}

/** Layout weight is a local override and wins over the catalog weight. */
export function resolveWeight(itemWeight: number | null, layoutWeight: number | null): number | null {
  return layoutWeight ?? itemWeight ?? null;
}
