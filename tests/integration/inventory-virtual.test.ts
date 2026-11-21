import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, closeDb, migrate, openDb, rollbackEvent, type Db } from '@profile/core';
import {
  createInventoryItem,
  inventoryItemRead,
  inventoryRead,
  updateInventoryItem,
} from '@profile/core/modules/inventory';
import { InventoryItemCreateSchema, InventoryItemPatchSchema } from '@profile/shared/contracts';
import { localClient } from '@profile/mcp';
import { seedInventory, type SeedInventory } from '../fixtures/inventory';

function createdId(result: { diff: { after: unknown } }): number {
  const after = result.diff.after;
  if (!after || typeof after !== 'object' || !('id' in after) || typeof after.id !== 'number') {
    throw new Error('create did not return an instance id');
  }
  return after.id;
}

let dir: string;
let db: Db;
let data: SeedInventory;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-virtual-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  data = seedInventory(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('virtual inventory instances', () => {
  it('defaults old rows to false and creates a virtual instance', () => {
    expect(inventoryItemRead(db, data.instanceIds.rifle!)?.virtual).toBe(false);

    const created = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Пузырь', kind: 'artifact', virtual: true, dryRun: false }),
    );
    const id = createdId(created);
    expect(inventoryItemRead(db, id)?.virtual).toBe(true);
    expect(inventoryRead(db, data.characterId).storages.flatMap((storage) => storage.items).find((item) => item.id === id))
      .toMatchObject({ virtual: true });
  });

  it('toggles the mark on and off and rolls it back exactly', () => {
    const id = data.instanceIds.rifle!;
    const on = updateInventoryItem(db, id, InventoryItemPatchSchema.parse({ virtual: true, dryRun: false }));
    expect(inventoryItemRead(db, id)?.virtual).toBe(true);

    rollbackEvent(db, on.eventId!, false);
    expect(inventoryItemRead(db, id)?.virtual).toBe(false);

    const off = updateInventoryItem(db, id, InventoryItemPatchSchema.parse({ virtual: true, dryRun: false }));
    expect(off.diff.human).toContain('virtual: false → true');
  });

  it('carries the flag in the payload and the MCP list output', async () => {
    const created = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Пузырь', kind: 'artifact', virtual: true, dryRun: false }),
    );
    const id = createdId(created);

    const payload = buildPayload(db) as { artifacts: { instanceId?: number; virtual?: boolean }[] };
    expect(payload.artifacts.find((row) => row.instanceId === id)).toMatchObject({ virtual: true });

    const client = localClient(db);
    const virtualOnly = await client.listInventoryItems({ virtual: true });
    expect(virtualOnly.map((item) => item.id)).toContain(id);
    expect(virtualOnly.every((item) => item.virtual)).toBe(true);

    const realOnly = await client.listInventoryItems({ virtual: false });
    expect(realOnly.some((item) => item.id === id)).toBe(false);
  });

  it('keeps a virtual item in the loadout preview like a real one', () => {
    const id = data.instanceIds.rifle!;
    const before = inventoryRead(db, data.characterId).stats;
    updateInventoryItem(db, id, InventoryItemPatchSchema.parse({ virtual: true, dryRun: false }));
    expect(inventoryRead(db, data.characterId).stats).toEqual(before);
  });
});
