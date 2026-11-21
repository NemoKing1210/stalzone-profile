import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import { localClient } from '@profile/mcp/client';
import {
  AddInventoryItemInputSchema,
  AutoArrangeStorageInputSchema,
  CreateStorageInputSchema,
  DeleteStorageInputSchema,
  MoveInventoryItemInputSchema,
  READ_OUTPUT_SCHEMAS,
  RemoveInventoryItemInputSchema,
  SetContainerArtifactsInputSchema,
  SetItemLayoutInputSchema,
  SetWeaponModificationInputSchema,
  UpdateInventoryItemInputSchema,
  UpdateStorageInputSchema,
} from '@profile/shared/contracts';
import { seedCatalog } from '../../fixtures/seed';
import { seedInventory } from '../../fixtures/inventory';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-mcp-contracts-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
  seedInventory(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('MCP read output contracts', () => {
  it('parses every read tool result', async () => {
    const client = localClient(db);
    const outputs: Record<string, unknown> = {
      get_character: await client.getCharacter(),
      find_items: { items: await client.findItems({ limit: 10 }) },
      get_item: { item: await client.getItem({ name: 'АК-12' }) },
      compare_items: { items: await client.compareItems('АК-12', 'KS-1', 15) },
      get_inventory: await client.getInventory(),
      list_storages: { storages: await client.listStorages() },
      list_inventory_items: { items: await client.listInventoryItems() },
      list_containers: { items: await client.listContainers() },
      plan_artifact_build: { plan: await client.planArtifactBuild({ preset: 'speed', slots: 3 }) },
      get_prices: { prices: await client.getPrices(['АК-12']) },
      sources_status: { sources: await client.sourcesStatus() },
      export_profile_json: { profile: await client.exportProfileJson() },
    };

    for (const [tool, output] of Object.entries(outputs)) {
      expect(() => READ_OUTPUT_SCHEMAS[tool]!.parse(output), tool).not.toThrow();
    }
  });
});

describe('MCP inventory input contracts', () => {
  it('defaults add_inventory_item to dry_run with confirm off', () => {
    const parsed = AddInventoryItemInputSchema.parse({ name: 'АК-12', kind: 'weapon' });
    expect(parsed.dry_run).toBe(true);
    expect(parsed.confirm).toBe(false);
    expect(parsed.level).toBe(0);
    expect(parsed.qty).toBe(1);
  });

  it('requires an item id and at least one change for an update', () => {
    expect(() => UpdateInventoryItemInputSchema.parse({ item_id: 1 })).toThrow();
    const parsed = UpdateInventoryItemInputSchema.parse({ item_id: 1, level: 15 });
    expect(parsed).toMatchObject({ item_id: 1, level: 15, dry_run: true, confirm: false });
  });

  it('parses a remove with an optional quantity', () => {
    expect(RemoveInventoryItemInputSchema.parse({ item_id: 3 })).toMatchObject({ item_id: 3, dry_run: true });
    expect(RemoveInventoryItemInputSchema.parse({ item_id: 3, qty: 5 }).qty).toBe(5);
  });

  it('parses every move target in snake_case', () => {
    const grid = MoveInventoryItemInputSchema.parse({
      item_id: 2,
      target: { location: 'grid', storage_id: 1, x: 0, y: 1 },
    });
    expect(grid.target).toMatchObject({ location: 'grid', storage_id: 1, x: 0, y: 1 });

    const equipment = MoveInventoryItemInputSchema.parse({
      item_id: 2,
      target: { location: 'equipment', slot: 'primary' },
    });
    expect(equipment.target).toMatchObject({ location: 'equipment', slot: 'primary' });

    const container = MoveInventoryItemInputSchema.parse({
      item_id: 2,
      target: { location: 'container', container_item_id: 4, slot: 0 },
    });
    expect(container.target).toMatchObject({ location: 'container', container_item_id: 4, slot: 0 });

    const modification = MoveInventoryItemInputSchema.parse({
      item_id: 2,
      target: { location: 'weapon_modification', weapon_item_id: 5, slot: 'scope' },
    });
    expect(modification.target).toMatchObject({
      location: 'weapon_modification',
      weapon_item_id: 5,
      slot: 'scope',
      allow_unverified: false,
    });
  });

  it('has no loose target and no storage-to-storage move option', () => {
    expect(() =>
      MoveInventoryItemInputSchema.parse({ item_id: 2, target: { location: 'loose' } }),
    ).toThrow();
    expect(
      DeleteStorageInputSchema.parse({ storage_id: 2, move_to_storage_id: 3 }),
    ).not.toHaveProperty('move_to_storage_id');
  });

  it('defaults storage writes and keeps the inventory storage undeletable by contract', () => {
    const created = CreateStorageInputSchema.parse({ name: 'Stash 2' });
    expect(created).toMatchObject({ kind: 'stash', dry_run: true, confirm: false });
    expect(created).not.toHaveProperty('width');
    expect(created).not.toHaveProperty('height');
    expect(UpdateStorageInputSchema.parse({ storage_id: 2, name: 'Renamed' }).name).toBe('Renamed');
    expect(DeleteStorageInputSchema.parse({ storage_id: 2 })).toMatchObject({
      storage_id: 2,
      dry_run: true,
    });
    expect(AutoArrangeStorageInputSchema.parse({ storage_id: 2 }).dry_run).toBe(true);
  });

  it('parses the container fill, weapon modification and layout writes', () => {
    const fill = SetContainerArtifactsInputSchema.parse({ container_item_id: 4, slots: [7, null] });
    expect(fill.slots).toEqual([7, null]);

    const modification = SetWeaponModificationInputSchema.parse({ weapon_item_id: 5, slot: 'muzzle' });
    expect(modification).toMatchObject({
      modification_item_id: null,
      allow_unverified: false,
      dry_run: true,
    });

    const layout = SetItemLayoutInputSchema.parse({ item_id: 6, width: 4, height: 2 });
    expect(layout).toMatchObject({ item_id: 6, width: 4, height: 2, weight: null, dry_run: true });
  });
});
