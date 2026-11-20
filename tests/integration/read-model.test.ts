import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import {
  buildCatalogSection,
  buildCharacterSection,
  buildContainersSection,
  buildMetaSection,
  buildPayload,
  exportProfileJson,
} from '@profile/core/modules/read-model';
import { upsertItem } from '@profile/core/testing';
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
    expect(payload.inventory.storages).toHaveLength(3);
    expect(payload.inventory.equipment.primary).not.toBeNull();
    expect(payload.weapons.map((weapon) => weapon.name)).toEqual(['АК-12', 'ПП-19']);
    expect(payload.armor.map((armor) => armor.name)).toEqual(['Комбинезон']);
    expect(payload.containers.map((container) => container.name)).toEqual(['Рюкзак']);
    expect(payload.artifacts.map((artifact) => artifact.name)).toEqual(['Нервяк', 'Пузырь']);
  });
  it('serves each route section without building the full payload', () => {
    seedInventory(db);
    const payload = buildPayload(db);
    expect(buildMetaSection(db)).toEqual({
      meta: payload.meta,
      catalogMeta: payload.catalog.meta,
      freshness: payload.freshness,
    });
    expect(buildCharacterSection(db)).toEqual(payload.character);
    expect(buildContainersSection(db)).toEqual(payload.containers);
    expect(buildCatalogSection(db, 'weapon')).toEqual(payload.catalog.weapons);
    expect(buildCatalogSection(db, 'armor')).toEqual(payload.catalog.armor);
  });
  it('builds a devices group from every device category and keeps it out of gear', () => {
    seedInventory(db);
    const names = {
      detector: 'Детектор широкого диапазона «Бурят»',
      nvg: 'Штурмовой ПНВ',
      sak: 'САК-1',
    };
    upsertItem(db, {
      externalId: 'dev-detector',
      name: names.detector,
      kind: 'weapon',
      category: 'weapon/device',
      rank: 'RANK_MASTER',
      weight: 0.5,
    });
    upsertItem(db, {
      externalId: 'dev-nvg',
      name: names.nvg,
      kind: 'armor',
      category: 'armor/device',
      rank: 'RANK_RARE',
    });
    upsertItem(db, {
      externalId: 'dev-sak',
      name: names.sak,
      kind: 'other',
      category: 'device/device',
    });

    const payload = PayloadSchema.parse(buildPayload(db));
    expect(payload.catalog.devices.map((device) => device.name)).toEqual([
      names.nvg,
      names.sak,
      names.detector,
    ]);
    for (const name of Object.values(names)) {
      expect(payload.catalog.weapons.map((row) => row.name)).not.toContain(name);
      expect(payload.catalog.armor.map((row) => row.name)).not.toContain(name);
    }
    expect(buildCatalogSection(db, 'device')).toEqual(payload.catalog.devices);
  });
  it('reuses the payload until the database changes', () => {
    seedCatalog(db);
    const first = buildPayload(db);
    expect(buildPayload(db)).toBe(first);

    upsertItem(db, {
      externalId: 'cache-bust',
      name: 'Cache Bust',
      kind: 'weapon',
      category: 'weapon/rifle',
    });
    expect(buildPayload(db)).not.toBe(first);
  });
  it('drops display-only sections from the export', () => {
    seedCatalog(db);
    const exported = exportProfileJson(db);
    expect(exported).not.toHaveProperty('icons');
    expect(exported).not.toHaveProperty('freshness');
    expect(exported).not.toHaveProperty('builds');
  });
});
