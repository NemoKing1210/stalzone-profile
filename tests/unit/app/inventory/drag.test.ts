import { describe, expect, it } from 'vitest';
import {
  cellPixels,
  grabPoint,
  gridUnder,
  isSameTarget,
  keyboardTarget,
  pickRotation,
  pointerToCell,
  previewBox,
  startPlacement,
} from '~/features/inventory/model/drag';
import { clampOrigin, ghostForGrid } from '~/features/inventory/model/grid';

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

  it('recognises equipment, container and module targets', () => {
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
  });

  it('rejects a different location', () => {
    expect(isSameTarget({ location: 'equipment', slot: 'primary' }, { location: 'equipment', slot: 'armor' })).toBe(
      false,
    );
    expect(isSameTarget({ location: 'loose' }, { location: 'grid', storageId: 1, x: 0, y: 0, rotated: false })).toBe(
      false,
    );
  });
});

describe('startPlacement', () => {
  const options = { homeStorageId: 7, intakeStorageId: 9 };

  it('keeps a storage item where it is', () => {
    expect(
      startPlacement({ location: 'grid', storageId: 4, x: 2, y: 3, rotated: true }, options),
    ).toEqual({
      ghost: { x: 2, y: 3, storageId: 4 },
      target: { location: 'grid', storageId: 4, x: 2, y: 3, rotated: true },
      rotated: true,
    });
  });

  it('starts an intake item on the home grid, because intake only releases items', () => {
    expect(
      startPlacement({ location: 'grid', storageId: 9, x: 2, y: 3, rotated: true }, options),
    ).toEqual({
      ghost: { x: 0, y: 0, storageId: 7 },
      target: { location: 'grid', storageId: 7, x: 0, y: 0, rotated: false },
      rotated: false,
    });
  });

  it('starts an equipped or slotted item on the home grid', () => {
    expect(startPlacement({ location: 'equipment', slot: 'primary' }, options)).toEqual({
      ghost: { x: 0, y: 0, storageId: 7 },
      target: { location: 'grid', storageId: 7, x: 0, y: 0, rotated: false },
      rotated: false,
    });
  });

  it('has no ghost without a home storage', () => {
    expect(
      startPlacement({ location: 'equipment', slot: 'primary' }, { homeStorageId: null, intakeStorageId: 9 }),
    ).toEqual({ ghost: null, target: null, rotated: false });
  });
});

describe('drag origin', () => {
  it('applies the grab offset and clamps the target', () => {
    const cell = { x: 7, y: 7 };
    const grab = { x: 2, y: 1 };
    expect(
      clampOrigin({ x: cell.x - grab.x, y: cell.y - grab.y }, { width: 3, height: 2 }, { width: 8, height: 8 }),
    ).toEqual({ x: 5, y: 6 });
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

describe('cellPixels', () => {
  it('splits a measured grid box into cell pixels', () => {
    expect(cellPixels({ width: 400, height: 400 }, { width: 8, height: 20 })).toEqual({
      width: 50,
      height: 20,
    });
  });
});

describe('previewBox', () => {
  it('keeps the grabbed cell under the pointer at the item footprint', () => {
    expect(
      previewBox({ x: 100, y: 200 }, { x: 1, y: 0 }, { width: 50, height: 50 }, { width: 2, height: 1 }),
    ).toEqual({ left: 50, top: 200, width: 100, height: 50 });
  });

  it('grows the preview for a rotated footprint', () => {
    expect(
      previewBox({ x: 100, y: 200 }, { x: 0, y: 0 }, { width: 40, height: 40 }, { width: 1, height: 5 }),
    ).toEqual({ left: 100, top: 200, width: 40, height: 200 });
  });
});

describe('pickRotation', () => {
  it('keeps the stored rotation of a storage item', () => {
    expect(pickRotation({ location: 'grid', storageId: 4, x: 0, y: 0, rotated: true }, 9)).toBe(true);
  });

  it('starts an intake item unrotated', () => {
    expect(pickRotation({ location: 'grid', storageId: 9, x: 0, y: 0, rotated: true }, 9)).toBe(false);
  });

  it('starts an item outside a grid unrotated', () => {
    expect(pickRotation({ location: 'equipment', slot: 'primary' }, 9)).toBe(false);
  });
});

describe('grabPoint', () => {
  it('keeps the grabbed cell of a grid tile', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(grabPoint('grid', rect, { x: 225, y: 75 }, { width: 4, height: 2 })).toEqual({ x: 2, y: 0 });
  });

  it('centers a slot-sourced card under the pointer, whatever the slot size', () => {
    const rect = { left: 0, top: 0, width: 741, height: 62 };
    expect(grabPoint('slot', rect, { x: 700, y: 60 }, { width: 5, height: 2 })).toEqual({ x: 2, y: 1 });
  });

  it('centers on the rotated footprint', () => {
    const rect = { left: 0, top: 0, width: 60, height: 300 };
    expect(grabPoint('slot', rect, { x: 50, y: 290 }, { width: 2, height: 5 })).toEqual({ x: 1, y: 2 });
  });
});

describe('ghostForGrid', () => {
  const items = [
    { id: 1, size: { width: 2, height: 2 }, placement: { x: 0, y: 0, rotated: false } },
    { id: 2, size: { width: 1, height: 1 }, placement: { x: 4, y: 4, rotated: false } },
  ];
  const picked = { id: 1, size: { width: 2, height: 2 } };

  it('is valid on free cells inside the grid', () => {
    expect(ghostForGrid({ width: 8, height: 8 }, picked, { x: 2, y: 0 }, false, items)).toEqual({
      x: 2,
      y: 0,
      width: 2,
      height: 2,
      valid: true,
    });
  });

  it('ignores the picked item itself when it lands on its own cells', () => {
    expect(ghostForGrid({ width: 8, height: 8 }, picked, { x: 1, y: 1 }, false, items).valid).toBe(true);
  });

  it('is invalid on a collision or past the edge', () => {
    expect(ghostForGrid({ width: 8, height: 8 }, picked, { x: 4, y: 4 }, false, items).valid).toBe(false);
    expect(ghostForGrid({ width: 8, height: 8 }, picked, { x: 7, y: 0 }, false, items).valid).toBe(false);
  });
});

describe('gridUnder', () => {
  const boxes = [
    { storageId: 1, left: 0, top: 0, width: 400, height: 400, columns: 8, rows: 8 },
    { storageId: 3, left: 420, top: 0, width: 400, height: 800, columns: 40, rows: 80 },
  ];

  it('finds the grid box under the pointer and the cell inside it', () => {
    expect(gridUnder({ x: 100, y: 50 }, boxes)).toEqual({ storageId: 1, x: 2, y: 1 });
    expect(gridUnder({ x: 520, y: 100 }, boxes)).toEqual({ storageId: 3, x: 10, y: 10 });
  });

  it('returns null outside every grid box', () => {
    expect(gridUnder({ x: 410, y: 10 }, boxes)).toBeNull();
  });

  it('treats the right and bottom edges as outside', () => {
    expect(gridUnder({ x: 400, y: 10 }, boxes)).toBeNull();
    expect(gridUnder({ x: 10, y: 400 }, boxes)).toBeNull();
  });

  it('uses the row count for the row height', () => {
    // 400x800 with 8 columns and 20 rows: cells are 50x40. At y=81 the square-cell
    // math (height/width) gives row 1, the real row height gives row 2.
    const box = { storageId: 3, left: 0, top: 0, width: 400, height: 800, columns: 8, rows: 20 };
    expect(gridUnder({ x: 25, y: 81 }, [box])).toEqual({ storageId: 3, x: 0, y: 2 });
  });
});
