import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import { buildPayload, exportProfileJson } from '@profile/core/modules/read-model';
import { PayloadSchema } from '@profile/shared/contracts';
import { seedCatalog } from '../fixtures/seed';
import { seedInventory } from '../fixtures/inventory';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-read-model-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('read model', () => {
  it('keeps an empty profile empty and parses its contract', () => {
    const payload = PayloadSchema.parse(buildPayload(db));
    expect(payload.weapons).toEqual([]);
    expect(payload.catalog.weapons).toEqual([]);
    expect(payload.inventory.storages).toEqual([]);
    expect(payload.inventory.equipment.primary).toBeNull();
  });
  it('builds the flat lists from the instance model', () => {
    seedInventory(db);
    const payload = PayloadSchema.parse(buildPayload(db));
    expect(payload.inventory.storages).toHaveLength(2);
    expect(payload.inventory.equipment.primary).not.toBeNull();
    expect(payload.weapons.map((weapon) => weapon.name)).toEqual(['АК-12', 'ПП-19']);
    expect(payload.armor.map((armor) => armor.name)).toEqual(['Комбинезон']);
    expect(payload.containers.map((container) => container.name)).toEqual(['Рюкзак']);
    expect(payload.artifacts.map((artifact) => artifact.name)).toEqual(['Нервяк', 'Пузырь']);
  });
  it('drops display-only sections from the export', () => {
    seedCatalog(db);
    const exported = exportProfileJson(db);
    expect(exported).not.toHaveProperty('icons');
    expect(exported).not.toHaveProperty('freshness');
    expect(exported).not.toHaveProperty('builds');
  });
});
