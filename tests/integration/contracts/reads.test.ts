import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, openDb, artifactSources, latestPricesForNames, migrate, type Db, getCharacter, inventoryRead, latestPriceReadsForNames, searchItemSummaries, listEvents, logEvent } from '@profile/core';
import {
  ArtifactSourceSchema,
  EventReadSchema,
  InventoryItemReadSchema,
  InventoryReadSchema,
  ItemSummarySchema,
  PriceRowSchema,
} from '@profile/shared/contracts';
import { eventJson } from '../../../server/utils/serialize';
import { seedCatalog } from '../../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-read-contracts-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('module read contracts', () => {
  it('parses item summaries', () => {
    const items = searchItemSummaries(db, { limit: 10 });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(() => ItemSummarySchema.parse(item)).not.toThrow();
  });

  it('parses the inventory read model', () => {
    const character = getCharacter(db);
    expect(character).not.toBeNull();
    const inventory = inventoryRead(db, character!.id);
    expect(() => InventoryReadSchema.parse(inventory)).not.toThrow();
    expect(inventory.storages.length).toBeGreaterThan(0);
    const gridItems = inventory.storages.flatMap((storage) => storage.items);
    for (const row of gridItems) expect(() => InventoryItemReadSchema.parse(row)).not.toThrow();
    expect(inventory.loose.length).toBeGreaterThan(0);
    for (const row of inventory.loose) expect(() => InventoryItemReadSchema.parse(row)).not.toThrow();
  });

  it('parses event rows, prices and artifact sources', () => {
    logEvent(db, { actor: 'owner', action: 'test', entity: 'inventory', entityId: 1, after: { a: 1 } });
    expect(() => EventReadSchema.parse(eventJson(listEvents(db)[0]!))).not.toThrow();

    const prices = latestPricesForNames(db, ['АК-12']);
    expect(prices['АК-12']!.length).toBeGreaterThan(0);
    for (const row of latestPriceReadsForNames(db, ['АК-12'])['АК-12']!) {
      expect(() => PriceRowSchema.parse(row)).not.toThrow();
    }

    const sources = artifactSources(db);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(() => ArtifactSourceSchema.parse(source)).not.toThrow();
  });
});
