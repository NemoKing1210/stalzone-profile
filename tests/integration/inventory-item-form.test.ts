import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db } from '@profile/core';
import { InventoryItemCreateSchema, InventoryItemPatchSchema } from '@profile/shared/contracts';
import {
  createInventoryItem,
  getInventoryItem,
  inventoryRead,
  updateInventoryItem,
} from '@profile/core/modules/inventory';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;
let characterId: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-item-form-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  characterId = seed.upsertCharacter(db, { nick: 'Tester', region: 'ru' });
  item('weapon', 'АК-12', { category: 'weapon/assault_rifle', slot: 'основное' });
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function item(kind: string, name: string, extra: Record<string, unknown> = {}): number {
  return seed.upsertItem(db, {
    sourceId: 'local',
    externalId: `item-form:${kind}:${name}`,
    name,
    kind,
    ...extra,
  });
}

function create(input: Record<string, unknown>): number {
  const result = createInventoryItem(
    db,
    InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: false, ...input }),
  );
  return (result.diff.after as { id: number }).id;
}

describe('per-kind item form contract', () => {
  it('derives the artifact tier from the one rarity input and leaves quality empty', () => {
    item('artifact', 'Нервяк', { category: 'artefact/gravity' });
    const id = create({ name: 'Нервяк', kind: 'artifact', rarityPct: 148 });

    expect(getInventoryItem(db, id)).toMatchObject({
      rarity_pct: 148,
      rarity_tier: 'exclusive',
      quality: null,
      level: 0,
    });
    expect(updateInventoryItem(db, id, { rarityPct: 120, dryRun: false })).toMatchObject({
      diff: { after: expect.objectContaining({ rarityPct: 120, rarityTier: 'special' }) },
    });
  });

  it('keeps quantity for stacks only and rejects it elsewhere', () => {
    item('ammo', '5.45', { category: 'bullet/545' });
    const id = create({ name: '5.45', kind: 'ammo', qty: 30 });
    expect(getInventoryItem(db, id)?.qty).toBe(30);

    expect(() => create({ name: 'АК-12', kind: 'weapon', qty: 2 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });

  it('rejects quality and rarity on non-artifacts', () => {
    expect(() => create({ name: 'АК-12', kind: 'weapon', quality: 'Rare 141%' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
    expect(() => create({ name: 'АК-12', kind: 'weapon', rarityPct: 110 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });

  it('accepts only a skin whose base item is the chosen item', () => {
    const rifle = item('weapon', 'АК-12', { category: 'weapon/assault_rifle' });
    const other = item('weapon', 'АК-15', { category: 'weapon/assault_rifle' });
    item('motif', 'Родной двор', { baseItemId: rifle });
    item('motif', 'Чужой облик', { baseItemId: other });

    const id = create({ name: 'АК-12', kind: 'weapon', skin: 'Родной двор' });
    expect(getInventoryItem(db, id)?.skin_item_id).toBeTypeOf('number');
    expect(() => create({ name: 'АК-12', kind: 'weapon', skin: 'Чужой облик' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
    expect(() => updateInventoryItem(db, id, { skin: 'Чужой облик', dryRun: false })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });

  it('reads the slot from the catalog item instead of the request', () => {
    item('weapon', 'АК-12', { category: 'weapon/assault_rifle', slot: 'основное' });
    const body = InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', dryRun: true });
    expect(body).not.toHaveProperty('slot');
    expect(() => InventoryItemCreateSchema.parse({ ...body, slot: 'вторичное' })).toThrow();
    const id = create({ name: 'АК-12', kind: 'weapon' });
    expect(getInventoryItem(db, id)?.slot).toBe('основное');
  });

  it('drops role and note from the contract, the table and the read model', () => {
    expect(InventoryItemCreateSchema.safeParse({ name: 'АК-12', kind: 'weapon', note: 'x' }).success).toBe(false);
    expect(InventoryItemCreateSchema.safeParse({ name: 'АК-12', kind: 'weapon', role: 'PvE' }).success).toBe(false);
    expect(InventoryItemPatchSchema.safeParse({ note: 'x' }).success).toBe(false);
    expect(InventoryItemPatchSchema.safeParse({ role: 'PvE' }).success).toBe(false);

    const columns = (db.prepare(`PRAGMA table_info(inventory_item)`).all() as { name: string }[]).map((row) => row.name);
    expect(columns).not.toContain('note');
    expect(columns).not.toContain('role');

    item('weapon', 'АК-12', { category: 'weapon/assault_rifle' });
    seed.insertStorage(db, { characterId, kind: 'inventory', name: 'Inventory', width: 8, height: 20 });
    create({ name: 'АК-12', kind: 'weapon' });
    const read = inventoryRead(db, characterId);
    const instance = read.storages.flatMap((storage) => storage.items)[0];
    expect(instance).not.toHaveProperty('note');
    expect(instance).not.toHaveProperty('role');
  });
});
