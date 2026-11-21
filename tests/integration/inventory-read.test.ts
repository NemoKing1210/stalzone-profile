import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import { buildPayload } from '@profile/core/modules/read-model';
import {
  getPlacement,
  hasInventory,
  inventoryCounts,
  inventoryItemRead,
  inventoryRead,
  moveInventoryItem,
  setContainerFill,
  updateInventoryItem,
} from '@profile/core/modules/inventory';
import { visibleContainerItems } from '~/features/inventory/model/containerFilters';
import { InventoryReadSchema, PayloadSchema } from '@profile/shared/contracts';
import * as seed from '@profile/core/testing';
import { seedInventory, type SeedInventory } from '../fixtures/inventory';

let dir: string;
let db: Db;
let data: SeedInventory;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inventory-read-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  data = seedInventory(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('inventory read', () => {
  it('returns the storages, equipment map and empty loose tray', () => {
    const read = inventoryRead(db, data.characterId);
    expect(read.storages.map((storage) => storage.kind)).toEqual(['inventory', 'overflow', 'stash']);
    expect(read.equipment.primary?.id).toBe(data.instanceIds.rifle);
    expect(read.equipment.armor?.id).toBe(data.instanceIds.armor);
    expect(read.equipment.container?.id).toBe(data.instanceIds.backpack);
    expect(read.equipment.secondary).toBeNull();
    const intake = read.storages.find((storage) => storage.id === data.storageIds.overflow);
    expect(intake?.items.map((item) => item.id).sort()).toEqual(
      [data.instanceIds.smg, data.instanceIds.artifact2, data.instanceIds.scope, data.instanceIds.ammo]
        .map(Number)
        .sort(),
    );
    expect(read.loose).toEqual([]);
  });

  it('filtering a storage changes no placement row and leaves hidden items in the read', () => {
    const read = inventoryRead(db, data.characterId);
    const stash = read.storages.find((storage) => storage.id === data.storageIds.overflow)!;
    const before = stash.items.map((item) => getPlacement(db, item.id));
    const visible = visibleContainerItems(stash.items, { kind: 'weapon', rank: 'ALL', quality: 'all' });
    expect(visible.length).toBeLessThan(stash.items.length);
    expect(stash.items.map((item) => getPlacement(db, item.id))).toEqual(before);
    expect(read.storages.find((storage) => storage.id === data.storageIds.overflow)?.items).toHaveLength(
      stash.items.length,
    );
  });

  it('describes an equipped rifle with its equipment placement', () => {
    const read = inventoryRead(db, data.characterId);
    expect(read.equipment.primary?.placement).toEqual({ location: 'equipment', slot: 'primary' });
    expect(read.equipment.primary?.level).toBe(15);
    expect(read.equipment.primary?.size).toEqual({ width: 5, height: 2 });
  });

  it('nests the container artifacts in slot order', () => {
    const read = inventoryRead(db, data.characterId);
    const bag = read.equipment.container;
    expect(bag?.container).toMatchObject({ slots: 2, eff: 100, protection: 50 });
    expect(bag?.artifacts?.map((artifact) => artifact.id)).toEqual([data.instanceIds.artifact1]);
    expect(bag?.artifacts?.[0]?.placement).toEqual({
      location: 'container',
      containerItemId: data.instanceIds.backpack,
      slotIndex: 0,
    });
  });

  it('counts effects only while the container is equipped but keeps its weight carried', () => {
    const before = inventoryRead(db, data.characterId);
    expect(before.stats.effects.speed_modifier?.positive.value).toBeCloseTo(7.8, 2);
    const carriedBefore = before.stats.carry.carried.value;

    moveInventoryItem(
      db,
      data.instanceIds.backpack!,
      { location: 'grid', storageId: data.storageIds.inventory, x: 0, y: 0 },
      { dryRun: false },
    );

    const after = inventoryRead(db, data.characterId);
    expect(after.stats.effects.speed_modifier).toBeUndefined();
    expect(after.stats.carry.carried.value).toBe(carriedBefore);
    expect(after.stats.carry.carried.value).toBeCloseTo(9.3, 2);
    const inventory = after.storages.find((storage) => storage.id === data.storageIds.inventory);
    expect(inventory?.items.map((item) => item.id)).toContain(data.instanceIds.backpack);
  });

  it('sums the armor, backpack and artifact carry bonuses and floors the safe limit', () => {
    seed.replaceItemStats(
      db,
      data.itemIds.armor!,
      [{ key: 'max_weight_bonus', level: 15, valueNum: 10, pct: false, positive: true }],
      'local',
    );
    seed.replaceItemStats(
      db,
      data.itemIds.backpack!,
      [{ key: 'max_weight_bonus', level: 15, valueNum: 5, pct: false, positive: true }],
      'local',
    );
    seed.replaceItemStats(
      db,
      data.itemIds.artifact1!,
      [
        { key: 'speed_modifier', level: 15, valueNum: 5, pct: true, positive: true },
        { key: 'max_weight_bonus', level: 15, valueNum: 10, pct: false, positive: true },
      ],
      'local',
    );

    const read = inventoryRead(db, data.characterId);
    expect(read.stats.carry.base).toBe(50);
    expect(read.stats.carry.bonus.value).toBeCloseTo(30.6, 2);
    expect(read.stats.carry.total.value).toBeCloseTo(80.6, 2);
    expect(read.stats.carry.safeLimit.value).toBe(60.4);
  });

  it('reports a missing weight without presenting a partial carried total', () => {
    const unknownItem = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'fixture:unknown-weight',
      name: 'Без веса',
      kind: 'other',
      category: null,
      weight: null,
    });
    const unknownId = seed.insertInventoryItem(db, {
      characterId: data.characterId,
      itemId: unknownItem,
      kind: 'other',
    });
    seed.upsertPlacement(db, {
      itemId: unknownId,
      characterId: data.characterId,
      location: 'loose',
    });

    const read = inventoryRead(db, data.characterId);
    expect(read.stats.carry.carried.value).toBeNull();
    expect(read.stats.carry.carried.missing).toContain(String(unknownId));
    expect(read.stats.warnings).toContain(`missing:weight:${unknownId}`);
  });

  it('makes a positive effect null and warns when the artifact rarity is missing', () => {
    updateInventoryItem(db, data.instanceIds.artifact1!, { rarityPct: null, dryRun: false });

    const read = inventoryRead(db, data.characterId);
    expect(read.stats.effects.speed_modifier?.positive.value).toBeNull();
    expect(read.stats.effects.speed_modifier?.positive.min).toBeNull();
    expect(read.stats.warnings).toContain(`missing:rarity:${data.instanceIds.artifact1}`);
  });

  it('falls back to the catalog container stats on a refined instance', () => {
    const packId = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'fixture:backpack-refined',
      name: 'Рюкзак 2',
      kind: 'container',
      category: 'containers/backpacks',
      weight: 1,
    });
    seed.replaceItemStats(
      db,
      packId,
      [
        { key: 'container.slots', level: 0, valueNum: 3 },
        { key: 'container.effectiveness', level: 0, valueNum: 80 },
        { key: 'container.protection', level: 0, valueNum: 25 },
      ],
      'wiki',
    );
    const instanceId = seed.insertInventoryItem(db, {
      characterId: data.characterId,
      itemId: packId,
      kind: 'container',
      level: 15,
    });
    seed.upsertPlacement(db, {
      itemId: instanceId,
      characterId: data.characterId,
      location: 'equipment',
      equipmentSlot: 'backpack',
    });

    const node = inventoryItemRead(db, instanceId);
    expect(node?.container).toMatchObject({ slots: 3, eff: 80, protection: 25 });

    const stats = inventoryRead(db, data.characterId).stats.containers.find(
      (container) => container.itemId === instanceId,
    );
    expect(stats).toMatchObject({ effectiveness: 80, slots: 3, innerProtection: { rad: 25 } });

    const fill = setContainerFill(db, instanceId, [data.instanceIds.artifact2!], { dryRun: false });
    expect(fill.eventId).toBeTypeOf('number');
  });

  it('exposes one item with its container children', () => {
    const node = inventoryItemRead(db, data.instanceIds.backpack!);
    expect(node?.artifacts?.map((artifact) => artifact.id)).toEqual([data.instanceIds.artifact1]);
    expect(inventoryItemRead(db, 999_999)).toBeNull();
  });

  it('puts a parsable inventory section into the payload and keeps the old arrays', () => {
    const payload = buildPayload(db, data.characterId);
    expect(() => InventoryReadSchema.parse(payload.inventory)).not.toThrow();
    expect(() => PayloadSchema.parse(payload)).not.toThrow();
    expect(payload.inventory.storages).toHaveLength(3);
    expect(Array.isArray(payload.weapons)).toBe(true);
  });

  it('counts items, storages and placements', () => {
    expect(inventoryCounts(db, data.characterId)).toEqual({ items: 8, storages: 3, placements: 8 });
    expect(hasInventory(db, data.characterId)).toBe(true);
    expect(hasInventory(db, 999_999)).toBe(false);
  });

  it('returns an empty inventory for a profile without a character', () => {
    const empty = inventoryRead(db, 999_999);
    expect(empty.storages).toEqual([]);
    expect(empty.loose).toEqual([]);
    expect(empty.equipment.primary).toBeNull();
    expect(empty.stats.carry.base).toBe(50);
    expect(empty.updatedAt).toBeNull();
  });
});
