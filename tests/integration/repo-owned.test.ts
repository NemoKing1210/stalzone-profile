import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@profile/core';
import * as repo from '@profile/core';
import * as seed from '@profile/core/testing';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-owned-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  repo.ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('owned items and containers', () => {
  it('keeps identical copies in one row and joins the skin name and icon', () => {
    const characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
    const skin = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:motif:1',
      name: 'Камуфляж',
      kind: 'motif',
    });
    const weapon = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:weapon:1',
      name: 'АК-12',
      kind: 'weapon',
    });
    seed.upsertIcon(db, { itemId: weapon, path: '/icons/ak.webp', mime: 'image/webp', sha1: 'ak', sourceId: 'local' });
    seed.upsertOwned(db, { characterId, itemId: weapon, kind: 'weapon', level: 15, skinItemId: skin, qty: 1 });
    seed.upsertOwned(db, { characterId, itemId: weapon, kind: 'weapon', level: 15, skinItemId: skin, qty: 2 });
    const rows = repo.listOwned(db, characterId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 2, skin_name: 'Камуфляж', item_icon: '/icons/ak.webp' });
  });

  it('keeps different qualities apart', () => {
    const characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
    const artifact = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:artifact:1',
      name: 'Нервяк',
      kind: 'artifact',
    });
    seed.upsertOwned(db, { characterId, itemId: artifact, kind: 'artifact', level: 15, quality: 'Редкий 141%' });
    seed.upsertOwned(db, { characterId, itemId: artifact, kind: 'artifact', level: 15, quality: 'Редкий 142%' });
    expect(repo.listOwned(db, characterId)).toHaveLength(2);
  });

  it('stores and updates container overrides and slots', () => {
    const characterId = seed.upsertCharacter(db, { nick: 'tester', region: 'ru' });
    const bag = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:container:1',
      name: 'Рюкзак',
      kind: 'container',
    });
    const artifact = seed.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:artifact:1',
      name: 'Нервяк',
      kind: 'artifact',
    });
    const ownedId = seed.upsertOwned(db, {
      characterId,
      itemId: bag,
      kind: 'container',
      container: { containerType: 'Рюкзак', shield: 5, bonus: 'Скрытность', protection: 10, slots: 4, eff: 80 },
    });
    expect(repo.getOwnedContainer(db, ownedId)).toMatchObject({ container_type: 'Рюкзак', slots: 4, eff: 80 });
    seed.replaceContainerSlots(
      db,
      ownedId,
      [{ itemId: artifact, level: 15, quality: 'Редкий' }],
      '2026-01-01T00:00:00.000Z',
    );
    expect(repo.listContainerSlots(db, ownedId)).toMatchObject([
      { slot: 0, artifact_item_id: artifact, level: 15, artifact_name: 'Нервяк' },
    ]);
    seed.upsertOwnedContainer(db, ownedId, { shield: 6 });
    expect(repo.getOwnedContainer(db, ownedId)?.shield).toBe(6);
    seed.deleteOwnedRow(db, ownedId);
    expect(repo.getOwnedContainer(db, ownedId)).toBeNull();
    expect(repo.listContainerSlots(db, ownedId)).toEqual([]);
  });
});
