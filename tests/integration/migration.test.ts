import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, rollbackEvent, type Db } from '@profile/core';
import * as seed from '@profile/core/testing';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
const NOW = '2026-01-01T00:00:00.000Z';

let dir: string;
let workDir: string;
let db: Db;

function copyMigrations(names: string[]): void {
  for (const name of names) fs.copyFileSync(path.join(migrationsDir, name), path.join(workDir, name));
}

function legacyMigrations(): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^000[1-5]_.*\.sql$/.test(file))
    .sort();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-migration-'));
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-migration-src-'));
  copyMigrations(legacyMigrations());
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, workDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(workDir, { recursive: true, force: true });
});

function columns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
}

function tableExists(name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

function seedCharacter(stash: string | null): void {
  db.prepare(
    `INSERT INTO character (id, nick, region, stash, created_at, updated_at)
     VALUES (1, 'Owner', 'ru', ?, ?, ?)`,
  ).run(stash, NOW, NOW);
}

function seedCatalog(): void {
  db.prepare(`INSERT INTO source (id, kind, updated_at) VALUES ('test', 'fixture', ?)`).run(NOW);
  const item = db.prepare(
    `INSERT INTO item (id, source_id, external_id, name, name_norm, kind, category, created_at, updated_at)
     VALUES (?, 'test', ?, ?, ?, ?, ?, ?, ?)`,
  );
  item.run(10, '10', 'Артефакт А', 'артефакт а', 'artifact', 'artifacts', NOW, NOW);
  item.run(11, '11', 'Рюкзак', 'рюкзак', 'container', 'backpacks', NOW, NOW);
  item.run(12, '12', 'Артефакт Б', 'артефакт б', 'artifact', 'artifacts', NOW, NOW);
  item.run(13, '13', 'Артефакт В', 'артефакт в', 'artifact', 'artifacts', NOW, NOW);
}

function seedLegacyInventory(): void {
  const owned = db.prepare(
    `INSERT INTO owned_item
       (id, character_id, item_id, kind, level, quality, note, role, slot, qty, display_name, created_at, updated_at)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  owned.run(100, 10, 'artifact', 3, 'Редкий', 'from trade', 'support', 'quick1', 2, null, NOW, NOW);
  owned.run(101, 11, 'container', 0, null, null, null, null, 1, 'Мой рюкзак', NOW, NOW);
  owned.run(102, 12, 'artifact', 2, '120%', null, null, null, 1, null, NOW, NOW);

  db.prepare(
    `INSERT INTO owned_container (owned_id, container_type, shield, bonus, protection, slots, eff)
     VALUES (101, 'backpack', 5, '+10%', 7, 2, 3)`,
  ).run();

  const slot = db.prepare(
    `INSERT INTO container_slot (container_owned_id, slot, artifact_item_id, level, quality, as_of)
     VALUES (101, ?, ?, ?, ?, ?)`,
  );
  slot.run(0, 12, 2, 'rare', NOW);
  slot.run(1, 13, 1, null, NOW);
  slot.run(2, 13, 4, null, NOW);

  db.prepare(
    `INSERT INTO event_log (id, at, actor, action, entity, entity_id, before, after)
     VALUES (1, ?, 'owner', 'owned.update', 'owned_item', '100', '{}', '{}')`,
  ).run(NOW);
}

function applyDataMigration(): void {
  copyMigrations(['0006_inventory_data.sql']);
  migrate(db, workDir);
}

describe('inventory data migration', () => {
  it('turns the legacy owned model into inventory instances and placements', () => {
    seedCharacter('Личный склад');
    seedCatalog();
    seedLegacyInventory();

    applyDataMigration();

    expect(db.prepare(`SELECT kind, name, name_norm, width, height FROM storage ORDER BY kind`).all()).toEqual([
      { kind: 'inventory', name: 'Inventory', name_norm: 'inventory', width: 8, height: 8 },
      { kind: 'stash', name: 'Личный склад', name_norm: 'личный склад', width: 8, height: 12 },
    ]);

    const instances = db
      .prepare(
        `SELECT id, item_id, kind, level, quality, rarity_pct, qty, role, slot, display_name
         FROM inventory_item ORDER BY id`,
      )
      .all() as {
      id: number;
      item_id: number;
      kind: string;
      level: number;
      quality: string | null;
      rarity_pct: number | null;
      qty: number;
      role: string | null;
      slot: string | null;
      display_name: string | null;
    }[];

    expect(instances).toHaveLength(7);
    // qty 2 expands into two identical instances; the original quality stays a string.
    expect(instances[0]).toMatchObject({
      item_id: 10,
      kind: 'artifact',
      level: 3,
      quality: 'Редкий',
      rarity_pct: null,
      qty: 1,
      role: 'support',
      slot: 'quick1',
    });
    expect(instances[1]).toMatchObject({ item_id: 10, level: 3, qty: 1, role: 'support' });
    expect(instances[2]).toMatchObject({ item_id: 11, kind: 'container', display_name: 'Мой рюкзак' });
    // A numeric quality is parsed into rarity_pct as well.
    expect(instances[3]).toMatchObject({ item_id: 12, quality: '120%', rarity_pct: 120 });
    // The fill creates new instances, including one for an artifact that is also owned.
    expect(instances.slice(4).map((row) => [row.item_id, row.level])).toEqual([
      [12, 2],
      [13, 1],
      [13, 4],
    ]);
    expect(instances.slice(4).every((row) => row.kind === 'artifact' && row.qty === 1)).toBe(true);

    const containerData = db
      .prepare(
        `SELECT i.item_id, cd.type, cd.shield, cd.bonus, cd.protection, cd.slots, cd.eff
         FROM container_data cd JOIN inventory_item i ON i.id = cd.item_id`,
      )
      .all();
    expect(containerData).toEqual([
      { item_id: 11, type: 'backpack', shield: 5, bonus: '+10%', protection: 7, slots: 2, eff: 3 },
    ]);

    const placements = db
      .prepare(
        `SELECT p.item_id, p.location, p.container_item_id, p.container_slot, i.item_id AS catalog_item, i.level
         FROM item_placement p JOIN inventory_item i ON i.id = p.item_id ORDER BY p.item_id`,
      )
      .all() as {
      item_id: number;
      location: string;
      container_item_id: number | null;
      container_slot: number | null;
      catalog_item: number;
      level: number;
    }[];

    expect(placements).toHaveLength(7);
    const containerId = instances[2].id;
    const filled = placements.filter((row) => row.location === 'container');
    expect(filled.map((row) => [row.container_slot, row.catalog_item])).toEqual([
      [0, 12],
      [1, 13],
    ]);
    expect(filled.every((row) => row.container_item_id === containerId)).toBe(true);

    const loose = placements.filter((row) => row.location === 'loose');
    expect(loose).toHaveLength(5);
    // A fill row beyond the container's effective slot count becomes loose.
    expect(loose.some((row) => row.catalog_item === 13 && row.level === 4)).toBe(true);

    expect(columns('character')).not.toContain('stash');
    for (const table of ['owned_item', 'owned_container', 'container_slot']) {
      expect(tableExists(table)).toBe(false);
    }
    expect(db.prepare(`SELECT action FROM event_log`).all()).toEqual([{ action: 'owned.update' }]);
  });

  it('names the stash Stash when the character has none', () => {
    seedCharacter(null);
    seedCatalog();

    applyDataMigration();

    expect(db.prepare(`SELECT name FROM storage WHERE kind = 'stash'`).get()).toEqual({ name: 'Stash' });
  });
});

describe('overflow storage migration', () => {
  it('adds intake, resizes defaults and converts loose placements', () => {
    seedCharacter('Личный склад');
    seedCatalog();
    seedLegacyInventory();
    applyDataMigration(); // 0006: legacy rows become loose placements

    copyMigrations(['0008_overflow_storage.sql']);
    migrate(db, workDir);

    expect(db.prepare(`SELECT kind, name, width, height FROM storage ORDER BY kind`).all()).toEqual([
      { kind: 'inventory', name: 'Inventory', width: 8, height: 20 },
      { kind: 'overflow', name: 'Intake', width: 40, height: 80 },
      { kind: 'stash', name: 'Личный склад', width: 40, height: 80 },
    ]);
    const loose = db
      .prepare(`SELECT COUNT(*) AS count FROM item_placement WHERE location = 'loose'`)
      .get() as { count: number };
    expect(loose.count).toBe(0);
    const grid = db
      .prepare(
        `SELECT p.x, p.y, s.kind FROM item_placement p JOIN storage s ON s.id = p.storage_id
         WHERE p.location = 'grid'`,
      )
      .all() as { x: number; y: number; kind: string }[];
    expect(grid.length).toBe(5);
    expect(grid.every((row) => row.kind === 'overflow' && row.x === 0)).toBe(true);
    expect(new Set(grid.map((row) => row.y)).size).toBe(grid.length);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('resizes the old 8 × 10 UI default and moves placements outside 8 × 20', () => {
    seedCharacter('Личный склад');
    seedCatalog();
    seedLegacyInventory();
    applyDataMigration();

    db.prepare(
      `INSERT INTO storage
         (character_id, kind, name, name_norm, width, height, max_weight, sort_order, created_at, updated_at)
       VALUES (1, 'stash', 'Старый', 'старый', 8, 10, NULL, 1, ?, ?)`,
    ).run(NOW, NOW);
    const inventory = db.prepare(`SELECT id FROM storage WHERE kind = 'inventory'`).get() as { id: number };
    const placed = db.prepare(`SELECT item_id FROM item_placement ORDER BY item_id LIMIT 1`).get() as {
      item_id: number;
    };
    // An older build could grow the inventory; this placement no longer fits 8 × 20.
    db.prepare(
      `UPDATE item_placement SET location = 'grid', storage_id = ?, x = 0, y = 30, rotated = 0
       WHERE item_id = ?`,
    ).run(inventory.id, placed.item_id);

    copyMigrations(['0008_overflow_storage.sql']);
    migrate(db, workDir);

    expect(db.prepare(`SELECT width, height FROM storage WHERE name = 'Старый'`).get()).toEqual({
      width: 40,
      height: 80,
    });
    const outOfBounds = db
      .prepare(
        `SELECT COUNT(*) AS count FROM item_placement p JOIN storage s ON s.id = p.storage_id
         WHERE s.kind = 'inventory' AND p.location = 'grid' AND (p.x > 7 OR p.y > 19)`,
      )
      .get() as { count: number };
    expect(outOfBounds.count).toBe(0);
    expect(
      db
        .prepare(
          `SELECT s.kind FROM item_placement p JOIN storage s ON s.id = p.storage_id
           WHERE p.item_id = ?`,
        )
        .get(placed.item_id),
    ).toEqual({ kind: 'overflow' });
  });
});

describe('intake grid width migration', () => {
  it('resizes intake to eight columns and repacks its origins into one column', () => {
    const through14 = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^00(?:0[6-9]|1[0-4])_.*\.sql$/.test(file))
      .sort();
    copyMigrations([...through14, '0018_inventory_virtual.sql']);
    migrate(db, workDir);
    ensureDefaultSources(db);

    const characterId = seed.upsertCharacter(db, { nick: 'Owner', region: 'ru' });
    const itemId = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'migration:intake:item',
      name: 'Коробка',
      kind: 'other',
    });
    const storageId = seed.insertStorage(db, {
      characterId,
      kind: 'overflow',
      name: 'Intake',
      width: 40,
      height: 80,
      sortOrder: 0,
    });
    const first = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    const second = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    const placeGrid = (id: number, x: number): void => {
      db.prepare(
        `INSERT INTO item_placement (item_id, character_id, location, storage_id, x, y, verified, updated_at)
         VALUES (?, ?, 'grid', ?, ?, 5, 1, ?)`,
      ).run(id, characterId, storageId, x, new Date().toISOString());
    };
    placeGrid(first, 39);
    placeGrid(second, 20);

    copyMigrations(['0015_intake_grid_width.sql']);
    migrate(db, workDir);

    expect(db.prepare(`SELECT width, height FROM storage WHERE id = ?`).get(storageId)).toEqual({
      width: 8,
      height: 80,
    });
    const placements = db
      .prepare(`SELECT item_id, x, y, rotated FROM item_placement WHERE storage_id = ? ORDER BY y`)
      .all(storageId) as { item_id: number; x: number; y: number; rotated: number }[];
    expect(placements).toEqual([
      { item_id: second, x: 0, y: 0, rotated: 0 },
      { item_id: first, x: 0, y: 1, rotated: 0 },
    ]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});


describe('item rotation removal migration', () => {
  it('drops the column, parks rotated rows in intake and keeps unrotated cells', () => {
    const through16 = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^00(?:0[6-9]|1[0-6])_.*\.sql$/.test(file))
      .sort();
    copyMigrations([...through16, '0018_inventory_virtual.sql']);
    migrate(db, workDir);
    ensureDefaultSources(db);

    const characterId = seed.upsertCharacter(db, { nick: 'Owner', region: 'ru' });
    const itemId = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'migration:rotation:item',
      name: 'Коробка',
      kind: 'other',
    });
    const inventoryId = seed.insertStorage(db, {
      characterId,
      kind: 'inventory',
      name: 'Inventory',
      width: 8,
      height: 20,
      sortOrder: 0,
    });
    const intakeId = seed.insertStorage(db, {
      characterId,
      kind: 'overflow',
      name: 'Intake',
      width: 8,
      height: 80,
      sortOrder: 0,
    });

    const home = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    const rotated = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    const intake = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    const moved = seed.insertInventoryItem(db, { characterId, itemId, kind: 'other' });
    const placedAt = (id: number, storage: number, x: number, y: number): void => {
      db.prepare(
        `INSERT INTO item_placement (item_id, character_id, location, storage_id, x, y, verified, updated_at)
         VALUES (?, ?, 'grid', ?, ?, ?, 1, ?)`,
      ).run(id, characterId, storage, x, y, new Date().toISOString());
    };
    placedAt(home, inventoryId, 0, 0);
    placedAt(rotated, inventoryId, 3, 3);
    placedAt(intake, intakeId, 0, 0);
    placedAt(moved, inventoryId, 5, 5);
    db.prepare(`UPDATE item_placement SET rotated = 1 WHERE item_id = ?`).run(rotated);

    copyMigrations(['0017_drop_item_rotation.sql']);
    migrate(db, workDir);

    expect(columns('item_placement')).not.toContain('rotated');
    const placements = db
      .prepare(`SELECT item_id, storage_id, x, y FROM item_placement WHERE item_id IN (?, ?, ?) ORDER BY item_id`)
      .all(home, rotated, intake) as { item_id: number; storage_id: number; x: number; y: number }[];
    expect(placements).toEqual([
      { item_id: home, storage_id: inventoryId, x: 0, y: 0 },
      { item_id: rotated, storage_id: intakeId, x: 0, y: 1 },
      { item_id: intake, storage_id: intakeId, x: 0, y: 0 },
    ]);

    const before = {
      id: moved,
      placement: { location: 'grid', storageId: inventoryId, x: 5, y: 5, rotated: true },
    };
    db.prepare(
      `INSERT INTO event_log (id, at, actor, action, entity, entity_id, before, after)
       VALUES (900, ?, 'owner', 'inventory.item.move', 'inventory', ?, ?, '{}')`,
    ).run(NOW, String(moved), JSON.stringify(before));

    // The rollback code runs the current schema, so the rename migration is applied first.
    copyMigrations(['0025_rename_modules_to_modifications.sql']);
    migrate(db, workDir);

    rollbackEvent(db, 900, false);

    expect(db.prepare(`SELECT storage_id, x, y FROM item_placement WHERE item_id = ?`).get(moved)).toEqual({
      storage_id: intakeId,
      x: 1,
      y: 0,
    });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});


describe('virtual inventory migration', () => {
  it('adds is_virtual defaulting old rows to real and accepts a virtual mark', () => {
    const through17 = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^00(?:0[6-9]|1[0-7])_.*\.sql$/.test(file))
      .sort();
    copyMigrations(through17);
    migrate(db, workDir);
    ensureDefaultSources(db);

    const characterId = seed.upsertCharacter(db, { nick: 'Owner', region: 'ru' });
    const itemId = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'migration:virtual:item',
      name: 'Коробка',
      kind: 'other',
    });
    db.prepare(
      `INSERT INTO inventory_item
         (character_id, item_id, kind, level, quality, rarity_pct, rarity_tier, skin_item_id, qty,
          display_name, slot, created_at, updated_at)
       VALUES (?, ?, 'other', 0, NULL, NULL, NULL, NULL, 1, NULL, NULL, ?, ?)`,
    ).run(characterId, itemId, NOW, NOW);

    copyMigrations(['0018_inventory_virtual.sql']);
    migrate(db, workDir);

    expect(columns('inventory_item')).toContain('is_virtual');
    expect(db.prepare(`SELECT is_virtual FROM inventory_item`).get()).toEqual({ is_virtual: 0 });
    db.prepare(`UPDATE inventory_item SET is_virtual = 1`).run();
    expect(db.prepare(`SELECT is_virtual FROM inventory_item`).get()).toEqual({ is_virtual: 1 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('modification rename migration', () => {
  it('renames kinds, placements, compatibility edges and journal tokens', () => {
    const through24 = fs
      .readdirSync(migrationsDir)
      .filter((file) => file < '0025_rename_modules_to_modifications.sql')
      .sort();
    copyMigrations(through24);
    migrate(db, workDir);
    ensureDefaultSources(db);

    const characterId = seed.upsertCharacter(db, { nick: 'Owner', region: 'ru' });
    const weaponId = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'migration:rename:weapon',
      name: 'Винтовка',
      kind: 'weapon',
      category: 'weapon/assault_rifle',
    });
    const modificationId = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'migration:rename:scope',
      name: 'Прицел',
      kind: 'attachment',
      category: 'attachment/scope',
    });
    const rifle = seed.insertInventoryItem(db, { characterId, itemId: weaponId, kind: 'weapon' });
    const scope = seed.insertInventoryItem(db, { characterId, itemId: modificationId, kind: 'attachment' });

    db.prepare(
      `INSERT INTO item_placement
         (item_id, character_id, location, weapon_item_id, module_slot, verified, updated_at)
       VALUES (?, ?, 'weapon_module', ?, 'scope', 1, ?)`,
    ).run(scope, characterId, rifle, NOW);
    db.prepare(
      `INSERT INTO attachment_compat (attachment_item_id, weapon_item_id, source, updated_at)
       VALUES (?, ?, 'manual', ?)`,
    ).run(modificationId, weaponId, NOW);

    const snapshot = {
      weaponItemId: rifle,
      slot: 'scope',
      attachmentItemId: scope,
      attachment: {
        kind: 'attachment',
        placement: { location: 'weapon_module', weaponSlot: scope, moduleSlot: 'scope' },
      },
      incomingPlacement: null,
    };
    db.prepare(
      `INSERT INTO event_log (id, at, actor, action, entity, entity_id, before, after)
       VALUES (900, ?, 'owner', 'inventory.item.module', 'inventory', ?, '{}', ?)`,
    ).run(NOW, String(rifle), JSON.stringify(snapshot));

    copyMigrations(['0025_rename_modules_to_modifications.sql']);
    migrate(db, workDir);

    expect(db.prepare(`SELECT kind FROM item WHERE id = ?`).get(modificationId)).toEqual({ kind: 'modification' });
    expect(db.prepare(`SELECT kind FROM inventory_item WHERE id = ?`).get(scope)).toEqual({ kind: 'modification' });
    expect(db.prepare(`SELECT location, modification_slot FROM item_placement WHERE item_id = ?`).get(scope)).toEqual({
      location: 'weapon_modification',
      modification_slot: 'scope',
    });
    expect(
      db.prepare(`SELECT modification_item_id, weapon_item_id FROM modification_compat`).get(),
    ).toEqual({ modification_item_id: modificationId, weapon_item_id: weaponId });
    expect(tableExists('attachment_compat')).toBe(false);

    const event = db.prepare(`SELECT action, after FROM event_log WHERE id = 900`).get() as {
      action: string;
      after: string;
    };
    expect(event.action).toBe('inventory.item.modification');
    expect(event.after).toContain('"modificationItemId"');
    expect(event.after).toContain('"modificationSlot":"scope"');
    expect(event.after).toContain('"location":"weapon_modification"');
    expect(event.after).toContain('"kind":"modification"');
    expect(event.after).not.toContain('"attachment');

    const prompt = db.prepare(`SELECT body FROM chat_prompt WHERE kind = 'skill' AND name = 'inventory'`).get() as {
      body: string;
    };
    expect(prompt.body).toContain('modifications never merge');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
