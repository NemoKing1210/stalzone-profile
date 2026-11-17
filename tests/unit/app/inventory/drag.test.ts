import { describe, expect, it } from 'vitest';
import { isSameTarget, keyboardTarget, pointerToCell } from '~/features/inventory/model/drag';

const grid = { width: 8, height: 8 };

describe('keyboardTarget', () => {
  it('moves the ghost with arrow keys and clamps at the grid edge', () => {
    expect(keyboardTarget({ x: 0, y: 0 }, 'ArrowLeft', { width: 2, height: 2 }, false, grid).x).toBe(0);
    expect(keyboardTarget({ x: 7, y: 0 }, 'ArrowRight', { width: 2, height: 2 }, false, grid).x).toBe(7);
  });

  it('moves one cell per arrow press', () => {
    expect(keyboardTarget({ x: 3, y: 3 }, 'ArrowDown', { width: 1, height: 1 }, false, grid)).toEqual({
      x: 3,
      y: 4,
      rotated: false,
    });
    expect(keyboardTarget({ x: 3, y: 3 }, 'ArrowUp', { width: 1, height: 1 }, false, grid)).toEqual({
      x: 3,
      y: 2,
      rotated: false,
    });
  });

  it('rotates the ghost and keeps the origin', () => {
    expect(keyboardTarget({ x: 2, y: 2 }, 'r', { width: 5, height: 2 }, false, grid)).toEqual({
      x: 2,
      y: 2,
      rotated: true,
    });
    expect(keyboardTarget({ x: 2, y: 2 }, 'R', { width: 5, height: 2 }, true, grid).rotated).toBe(false);
  });

  it('leaves the ghost alone for other keys', () => {
    expect(keyboardTarget({ x: 1, y: 1 }, 'Enter', { width: 1, height: 1 }, false, grid)).toEqual({
      x: 1,
      y: 1,
      rotated: false,
    });
  });
});

describe('isSameTarget', () => {
  it('recognises the current grid cell', () => {
    const placement = { location: 'grid' as const, storageId: 4, x: 2, y: 1, rotated: false };
    expect(isSameTarget(placement, { location: 'grid', storageId: 4, x: 2, y: 1, rotated: false })).toBe(true);
    expect(isSameTarget(placement, { location: 'grid', storageId: 4, x: 2, y: 1, rotated: true })).toBe(false);
    expect(isSameTarget(placement, { location: 'grid', storageId: 5, x: 2, y: 1, rotated: false })).toBe(false);
  });

  it('recognises equipment, container, module and loose targets', () => {
    expect(isSameTarget({ location: 'equipment', slot: 'primary' }, { location: 'equipment', slot: 'primary' })).toBe(true);
    expect(isSameTarget({ location: 'equipment', slot: 'primary' }, { location: 'equipment', slot: 'armor' })).toBe(false);
    expect(
      isSameTarget(
        { location: 'container', containerItemId: 3, slotIndex: 1 },
        { location: 'container', containerItemId: 3, slot: 1 },
      ),
    ).toBe(true);
    expect(
      isSameTarget(
        { location: 'weapon_module', weaponItemId: 3, slot: 'scope', verified: true },
        { location: 'weapon_module', weaponItemId: 3, slot: 'scope', allowUnverified: false },
      ),
    ).toBe(true);
    expect(isSameTarget({ location: 'loose' }, { location: 'loose' })).toBe(true);
  });

  it('rejects a different location', () => {
    expect(isSameTarget({ location: 'loose' }, { location: 'equipment', slot: 'primary' })).toBe(false);
  });
});

describe('pointerToCell', () => {
  it('maps a pointer event through the element rectangle', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 320 }),
    };
    const event = { clientX: 225, clientY: 160 };

    expect(pointerToCell(event, element, 8)).toEqual({ x: 2, y: 2 });
  });
});
