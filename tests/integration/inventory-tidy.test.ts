import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  ensureDefaultSources,
  eventCount,
  getEvent,
  migrate,
  openDb,
  rollbackEvent,
  WriteError,
  type Db,
} from '@profile/core';
import { InventoryItemCreateSchema, TidyStorageSchema } from '@profile/shared/contracts';
import {
  createInventoryItem,
  createStorage,
  ensureInventoryStorage,
  getPlacement,
  getStorage,
  tidyStorage,
  upsertPlacement,
} from '@profile/core/modules/inventory';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;
let characterId: number;
let storageId: number;

function idOf(result: { diff: { after: unknown } }): number {
  return (result.diff.after as { id: number }).id;
}

function expectWriteError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected WriteError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(WriteError);
    expect((error as WriteError).code).toBe(code);
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-tidy-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
  ensureInventoryStorage(db, characterId);
  storageId = idOf(createStorage(db, { kind: 'stash', name: 'Stash', dryRun: false }));
  seed.upsertItem(db, {
    sourceId: 'local',
    externalId: 'tidy:rifle',
    name: 'АК-12',
    kind: 'weapon',
    category: 'weapon/assault_rifle',
  });
  seed.upsertItem(db, {
    sourceId: 'local',
    externalId: 'tidy:artifact',
    name: 'Артефакт',
    kind: 'artifact',
    category: 'artefact/gravity',
  });
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('tidy storage', () => {
  it('packs items by order as one audited write and rolls back', () => {
    const rifle = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })),
    );
    const artifact = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', dryRun: false })),
    );
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId, x: 0, y: 5 });
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId, x: 3, y: 5 });

    const result = tidyStorage(db, storageId, TidyStorageSchema.parse({ order: 'name', dryRun: false }));
    expect(result.eventId).toBeTypeOf('number');
    expect(getEvent(db, result.eventId!)?.action).toBe('inventory.storage.tidy');
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 0 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 5, y: 0 });

    rollbackEvent(db, result.eventId!, false);
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 5 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 3, y: 5 });
  });

  it('writes nothing on a dry run or when the storage is already packed', () => {
    const artifact = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', dryRun: false })),
    );
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId, x: 0, y: 0 });
    const before = eventCount(db);
    const dry = tidyStorage(db, storageId, TidyStorageSchema.parse({ order: 'kind', dryRun: true }));
    expect(dry.dryRun).toBe(true);
    expect(dry.eventId).toBeUndefined();
    expect(eventCount(db)).toBe(before);

    const real = tidyStorage(db, storageId, TidyStorageSchema.parse({ order: 'kind', dryRun: false }));
    expect(real.eventId).toBeUndefined();
    expect(getPlacement(db, artifact)).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps an item that cannot be packed at its cells and reports it', () => {
    const small = seed.insertStorage(db, {
      characterId,
      kind: 'stash',
      name: 'Tiny',
      width: 4,
      height: 4,
      sortOrder: 0,
    });
    const artifact = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'Артефакт', kind: 'artifact', dryRun: false })),
    );
    const rifle = idOf(
      createInventoryItem(db, InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false })),
    );
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId: small, x: 0, y: 0 });
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId: small, x: 0, y: 2 });

    const result = tidyStorage(db, small, TidyStorageSchema.parse({ order: 'kind', dryRun: false }));
    expect(result.diff.after).toMatchObject({ unplaced: [rifle] });
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 2 });
  });

  it('refuses the read-only intake storage', () => {
    const intake = seed.insertStorage(db, {
      characterId,
      kind: 'overflow',
      name: 'Intake',
      width: 40,
      height: 80,
      sortOrder: 0,
    });
    expectWriteError(
      () => tidyStorage(db, intake, TidyStorageSchema.parse({ dryRun: false })),
      'VALIDATION',
    );
    expect(getStorage(db, intake)?.kind).toBe('overflow');
  });
});

describe('tidy placement order and rollback', () => {
  function makeItem(name: string, kind: 'weapon' | 'artifact' | 'armor', category: string): { itemId: number; instance: number } {
    const itemId = seed.upsertItem(db, { sourceId: 'local', externalId: `tidy-order:${name}`, name, kind, category });
    const instance = seed.insertInventoryItem(db, { characterId, itemId, kind });
    return { itemId, instance };
  }

  function storage(width: number, height: number): number {
    return seed.insertStorage(db, { characterId, kind: 'stash', name: `S${width}x${height}`, width, height, sortOrder: 0 });
  }

  it('parks every moved item so a reordered origin cannot collide', () => {
    const box = storage(8, 8);
    const rifle = makeItem('A rifle', 'weapon', 'weapon/assault_rifle').instance;
    const artifact = makeItem('B artifact', 'artifact', 'artefact/gravity').instance;
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId: box, x: 3, y: 0 });
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId: box, x: 0, y: 0 });

    const result = tidyStorage(db, box, TidyStorageSchema.parse({ order: 'name', dryRun: false }));
    expect(result.eventId).toBeTypeOf('number');
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 0 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 5, y: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM item_placement WHERE storage_id = ? AND location = 'loose'`).get(box)).toEqual({ n: 0 });

    rollbackEvent(db, result.eventId!, false);
    expect(getPlacement(db, rifle)).toMatchObject({ x: 3, y: 0 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 0, y: 0 });
  });

  it('parks the snapshot before a rollback so item order cannot collide', () => {
    const box = storage(8, 8);
    const rifle = makeItem('B rifle', 'weapon', 'weapon/assault_rifle').instance;
    const artifact = makeItem('A artifact', 'artifact', 'artefact/gravity').instance;
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId: box, x: 0, y: 0 });
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId: box, x: 5, y: 0 });

    const result = tidyStorage(db, box, TidyStorageSchema.parse({ order: 'name', dryRun: false }));
    expect(getPlacement(db, artifact)).toMatchObject({ x: 0, y: 0 });
    expect(getPlacement(db, rifle)).toMatchObject({ x: 1, y: 0 });

    rollbackEvent(db, result.eventId!, false);
    expect(getPlacement(db, rifle)).toMatchObject({ x: 0, y: 0 });
    expect(getPlacement(db, artifact)).toMatchObject({ x: 5, y: 0 });
  });

  it('refuses a rollback whose snapshot target is now occupied by another item', () => {
    const box = storage(10, 10);
    const rifle = makeItem('rifle', 'weapon', 'weapon/assault_rifle').instance;
    const artifact = makeItem('artifact', 'artifact', 'artefact/gravity').instance;
    upsertPlacement(db, { itemId: rifle, characterId, location: 'grid', storageId: box, x: 0, y: 0 });
    upsertPlacement(db, { itemId: artifact, characterId, location: 'grid', storageId: box, x: 5, y: 5 });

    const result = tidyStorage(db, box, TidyStorageSchema.parse({ order: 'kind', dryRun: false }));
    const armor = makeItem('armor', 'armor', 'armor/combat').instance;
    upsertPlacement(db, { itemId: armor, characterId, location: 'grid', storageId: box, x: 5, y: 5 });

    expectWriteError(() => rollbackEvent(db, result.eventId!, false), 'ROLLBACK_CONFLICT');
    expect(getPlacement(db, armor)).toMatchObject({ x: 5, y: 5 });
  });
});

describe('tidy property loop', () => {
  function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  it('keeps fifty seeded layouts complete, disjoint and exactly rollbackable', () => {
    let state = 0x5eed;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const orders = ['kind', 'name', 'rank', 'footprint'] as const;

    for (let layout = 0; layout < 50; layout += 1) {
      const width = 8;
      const height = 8;
      const box = seed.insertStorage(db, {
        characterId,
        kind: 'stash',
        name: `Prop ${layout}`,
        width,
        height,
        sortOrder: 0,
      });
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const originals = new Map<number, { x: number; y: number }>();
      for (let index = 0; index < 8; index += 1) {
        const w = 1 + Math.floor(random() * 3);
        const h = 1 + Math.floor(random() * 3);
        let placed: { x: number; y: number } | null = null;
        for (let attempt = 0; attempt < 40 && !placed; attempt += 1) {
          const x = Math.floor(random() * (width - w + 1));
          const y = Math.floor(random() * (height - h + 1));
          const candidate = { x, y, w, h };
          if (!occupied.some((rect) => rectsOverlap(candidate, rect))) placed = { x, y };
        }
        if (!placed) continue;
        const itemId = seed.upsertItem(db, {
          sourceId: 'local',
          externalId: `prop:${layout}:${index}`,
          name: `item-${index}`,
          kind: 'artifact',
          category: 'artefact/gravity',
        });
        seed.upsertItemLayout(db, itemId, { width: w, height: h });
        const instance = seed.insertInventoryItem(db, { characterId, itemId, kind: 'artifact' });
        upsertPlacement(db, { itemId: instance, characterId, location: 'grid', storageId: box, x: placed.x, y: placed.y });
        occupied.push({ x: placed.x, y: placed.y, w, h });
        originals.set(instance, placed);
      }

      const result = tidyStorage(db, box, TidyStorageSchema.parse({ order: orders[layout % orders.length], dryRun: false }));
      const rows = db
        .prepare(`SELECT item_id, x, y, rotated, location FROM item_placement WHERE storage_id = ?`)
        .all(box) as { item_id: number; x: number; y: number; rotated: number; location: string }[];
      expect(rows).toHaveLength(originals.size);
      expect(rows.every((row) => row.location === 'grid')).toBe(true);
      const sizes = new Map<number, { w: number; h: number }>();
      for (const row of rows) {
        const placement = getPlacement(db, row.item_id);
        const found = occupied.find((rect) => rect.x === originals.get(row.item_id)?.x && rect.y === originals.get(row.item_id)?.y);
        sizes.set(row.item_id, { w: found?.w ?? 1, h: found?.h ?? 1 });
        expect(placement?.location).toBe('grid');
      }
      const cells = rows.map((row) => {
        const size = sizes.get(row.item_id)!;
        const rotated = row.rotated === 1;
        return { x: row.x, y: row.y, w: rotated ? size.h : size.w, h: rotated ? size.w : size.h };
      });
      for (let left = 0; left < cells.length; left += 1) {
        for (let right = left + 1; right < cells.length; right += 1) {
          expect(rectsOverlap(cells[left]!, cells[right]!)).toBe(false);
        }
      }
      expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
      if (result.eventId) {
        rollbackEvent(db, result.eventId, false);
        for (const [instance, at] of originals) expect(getPlacement(db, instance)).toMatchObject(at);
      }
    }
  });
});
