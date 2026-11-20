import type { EquipmentRead, EquipmentSlot, InventoryItemRead } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import {
  EQUIPMENT_GRID,
  equipmentLayout,
  slotFootprint,
  type EquipmentCell,
} from '~/features/inventory/model/equipmentLayout';

function weapon(size: { width: number; height: number }): InventoryItemRead {
  return {
    id: 1,
    itemId: 1,
    name: 'Weapon',
    displayName: null,
    kind: 'weapon',
    category: 'weapon/assault_rifle',
    rank: null,
    level: 0,
    quality: null,
    rarityPct: null,
    rarityTier: null,
    qty: 1,
    skinItemId: null,
    icon: null,
    slot: null,
    weight: null,
    size,
    placement: { location: 'loose' },
    container: null,
  };
}

function overlaps(a: EquipmentCell, b: EquipmentCell): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('slotFootprint', () => {
  it('gives a weapon slot the held weapon footprint, 5-6 cells wide', () => {
    expect(slotFootprint('primary', weapon({ width: 6, height: 2 }))).toEqual({ width: 6, height: 2 });
    expect(slotFootprint('primary', weapon({ width: 4, height: 2 }))).toEqual({ width: 5, height: 2 });
    expect(slotFootprint('melee', weapon({ width: 5, height: 1 }))).toEqual({ width: 5, height: 2 });
  });

  it('gives empty weapon slots a 5x2 footprint', () => {
    expect(slotFootprint('primary', null)).toEqual({ width: 5, height: 2 });
    expect(slotFootprint('secondary', null)).toEqual({ width: 5, height: 2 });
  });

  it('gives armor and containers a 3x3 footprint and quick slots one cell', () => {
    for (const slot of ['armor', 'backpack', 'container'] as EquipmentSlot[]) {
      expect(slotFootprint(slot, null)).toEqual({ width: 3, height: 3 });
    }
    for (const slot of ['quick1', 'quick2', 'quick3', 'quick4'] as EquipmentSlot[]) {
      expect(slotFootprint(slot, null)).toEqual({ width: 1, height: 1 });
    }
  });
});

describe('equipmentLayout', () => {
  const equipment = {
    primary: weapon({ width: 6, height: 2 }),
    secondary: weapon({ width: 5, height: 2 }),
  } as unknown as EquipmentRead;

  const cells = equipmentLayout(equipment);

  it('places every slot once inside the grid', () => {
    expect(cells.map((cell) => cell.slot).sort()).toEqual(
      ['primary', 'secondary', 'melee', 'armor', 'backpack', 'container', 'quick1', 'quick2', 'quick3', 'quick4'].sort(),
    );
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.width).toBeLessThanOrEqual(EQUIPMENT_GRID.columns);
      expect(cell.y + cell.height).toBeLessThanOrEqual(EQUIPMENT_GRID.rows);
    }
  });

  it('never overlaps two slots', () => {
    for (const left of cells) {
      for (const right of cells) {
        if (left.slot === right.slot) continue;
        expect(overlaps(left, right), `${left.slot} × ${right.slot}`).toBe(false);
      }
    }
  });

  it('keeps the quick slots in one row under the equipment', () => {
    const quicks = cells.filter((cell) => cell.slot.startsWith('quick'));
    expect(new Set(quicks.map((cell) => cell.y)).size).toBe(1);
    expect(quicks.map((cell) => cell.x)).toEqual([0, 1, 2, 3]);
  });
});
