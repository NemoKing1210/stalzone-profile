import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, rollbackEvent, type Db } from '@profile/core';
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


describe('exact catalog item create', () => {
  function kindItem(kind: string, name: string, extra: Record<string, unknown> = {}): number {
    return item(kind, name, extra);
  }

  it('creates every ownable kind from the exact catalog id', () => {
    const cases: { kind: string; name: string; category: string; qty?: number }[] = [
      { kind: 'attachment', name: 'Прицел', category: 'attachment/scope' },
      { kind: 'ammo', name: 'Патрон 7.62', category: 'bullet/762', qty: 30 },
      { kind: 'other', name: 'Аптечка', category: 'consumable/med' },
      { kind: 'weapon', name: 'АК-12т', category: 'weapon/assault_rifle' },
      { kind: 'armor', name: 'Броня', category: 'armor/combat' },
      { kind: 'container', name: 'Рюкзак', category: 'container/backpack' },
      { kind: 'artifact', name: 'Артефакт 2', category: 'artefact/gravity' },
    ];
    for (const entry of cases) {
      const catalogId = kindItem(entry.kind, entry.name, { category: entry.category });
      const result = createInventoryItem(
        db,
        InventoryItemCreateSchema.parse({
          name: entry.name,
          kind: entry.kind,
          catalogItemId: catalogId,
          qty: entry.qty ?? 1,
          dryRun: false,
        }),
      );
      const created = result.diff.after as { id: number; kind: string; itemId: number; qty: number };
      expect(getInventoryItem(db, created.id)).toMatchObject({
        kind: entry.kind,
        item_id: catalogId,
        qty: entry.qty ?? 1,
      });
    }
  });

  it('refuses a missing id, a stale id and an id of another kind', () => {
    const rifle = kindItem('weapon', 'АК-12', { category: 'weapon/assault_rifle' });
    expect(() => create({ name: 'АК-12', kind: 'weapon', catalogItemId: 999999 })).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_ITEM' }),
    );
    expect(() => create({ name: 'АК-12', kind: 'armor', catalogItemId: rifle })).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_ITEM' }),
    );
    expect(() =>
      InventoryItemCreateSchema.parse({ name: 'x', kind: 'motif', dryRun: false }),
    ).toThrow();
  });

  it('keeps quantity 1 for attachments and stacks ammo into the intake', () => {
    const scope = kindItem('attachment', 'Прицел', { category: 'attachment/scope' });
    expect(() => create({ name: 'Прицел', kind: 'attachment', catalogItemId: scope, qty: 2 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );

    const ammo = kindItem('ammo', 'Патрон 7.62', { category: 'bullet/762' });
    const first = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Патрон 7.62', kind: 'ammo', catalogItemId: ammo, qty: 10, dryRun: false }),
    );
    const firstId = (first.diff.after as { id: number }).id;
    const second = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Патрон 7.62', kind: 'ammo', catalogItemId: ammo, qty: 5, dryRun: false }),
    );
    expect((second.diff.after as { id: number }).id).toBe(firstId);
    expect(getInventoryItem(db, firstId)?.qty).toBe(15);
  });

  it('rolls back an instance created by catalog id', () => {
    const id = kindItem('attachment', 'Прицел', { category: 'attachment/scope' });
    const result = createInventoryItem(
      db,
      InventoryItemCreateSchema.parse({ name: 'Прицел', kind: 'attachment', catalogItemId: id, dryRun: false }),
    );
    const instance = (result.diff.after as { id: number }).id;
    rollbackEvent(db, result.eventId!, false);
    expect(getInventoryItem(db, instance)).toBeNull();
  });
});
