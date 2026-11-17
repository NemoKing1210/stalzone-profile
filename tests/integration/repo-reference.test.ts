import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@dossier/core';
import * as repo from '@dossier/core';
import * as seed from '@dossier/core/testing';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-ref-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  repo.ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('reference repositories', () => {
  it('upserts a weapon by realm and external id', () => {
    const id = seed.upsertItem(db, {
      sourceId: 'exbo_base',
      externalId: 'ak-12',
      name: 'АК-12',
      nameEn: 'AK-12',
      kind: 'weapon',
      category: 'weapon/assault_rifle',
      rank: 'RANK_MASTER',
      slot: 'основное',
      weight: 3.8,
    });
    const again = seed.upsertItem(db, { sourceId: 'exbo_base', externalId: 'ak-12', name: 'АК-12', kind: 'weapon' });
    expect(again).toBe(id);
    expect(repo.getItemById(db, id)).toMatchObject({ external_id: 'ak-12', name_norm: 'ак-12', weight: 3.8 });
  });

  it('replaces only the stats belonging to one source', () => {
    const id = seed.upsertItem(db, { sourceId: 'exbo_base', externalId: 'ak-12', name: 'АК-12', kind: 'weapon' });
    seed.replaceItemStats(
      db,
      id,
      [
        { key: 'damage.start', level: 0, valueNum: 40 },
        { key: 'damage.start', level: 15, valueNum: 55 },
      ],
      'exbo_base',
    );
    seed.addItemStats(db, id, [{ key: 'weapon.tooltip.weapon.info.rate_of_fire', valueNum: 600 }], 'wiki');
    seed.replaceItemStats(db, id, [{ key: 'damage.start', level: 0, valueNum: 42 }], 'exbo_base');
    const rows = repo.itemStats(db, id).map((row) => `${row.stat_id}@${row.level}=${row.value_num ?? row.value_text}`);
    expect(rows).toEqual(['damage.start@0=42', 'weapon.tooltip.weapon.info.rate_of_fire@0=600']);
  });

  it('does not let a lower-priority source overwrite a higher-priority stat', () => {
    const id = seed.upsertItem(db, { sourceId: 'exbo_base', externalId: 'ak-12', name: 'АК-12', kind: 'weapon' });
    seed.replaceItemStats(db, id, [{ key: 'weapon.tooltip.weapon.info.distance', valueNum: 500 }], 'wiki');
    seed.replaceItemStats(
      db,
      id,
      [{ key: 'weapon.tooltip.weapon.info.distance', valueText: '["500"]' }],
      'exbo_base',
    );

    expect(repo.itemStats(db, id)).toMatchObject([
      { stat_id: 'weapon.tooltip.weapon.info.distance', value_num: 500, value_text: null, source_id: 'wiki' },
    ]);
  });

  it('lets a higher-priority source replace a lower-priority stat', () => {
    const id = seed.upsertItem(db, { sourceId: 'exbo_base', externalId: 'ak-12', name: 'АК-12', kind: 'weapon' });
    seed.replaceItemStats(db, id, [{ key: 'weapon.tooltip.weapon.info.distance', valueNum: 400 }], 'exbo_base');
    seed.replaceItemStats(db, id, [{ key: 'weapon.tooltip.weapon.info.distance', valueNum: 500 }], 'wiki');

    expect(repo.itemStats(db, id)).toMatchObject([
      { stat_id: 'weapon.tooltip.weapon.info.distance', value_num: 500, source_id: 'wiki' },
    ]);
  });

  it('requires stat definitions at the database boundary', () => {
    const id = seed.upsertItem(db, { sourceId: 'local', externalId: 'local:weapon:x', name: 'Тест', kind: 'weapon' });
    expect(() =>
      db.prepare(`INSERT INTO item_stat (item_id, stat_id, level, value_num) VALUES (?, 'damage.start', 0, 1)`).run(id),
    ).toThrow(/FOREIGN KEY/);
    seed.ensureStatDefinition(db, 'damage.start');
    seed.replaceItemStats(db, id, [{ key: 'damage.start', valueNum: 1 }], 'local');
    seed.replaceItemEffects(db, id, [{ position: 0, label: 'Урон +10', isPositive: true }]);
    expect(repo.listItemEffects(db, id)).toEqual([{ item_id: id, position: 0, label: 'Урон +10', is_positive: 1 }]);
    db.prepare(`DELETE FROM item WHERE id = ?`).run(id);
    expect(repo.listItemEffects(db, id)).toEqual([]);
  });

  it('stores one icon per item and maps legacy keys', () => {
    const id = seed.upsertItem(db, { sourceId: 'local', externalId: 'local:weapon:x', name: 'АК-12', kind: 'weapon' });
    seed.upsertIcon(db, { itemId: id, path: '/icons/a.webp', mime: 'image/webp', sha1: 'a', sourceId: 'local' });
    seed.upsertIcon(db, { itemId: id, path: '/icons/b.webp', mime: 'image/webp', sha1: 'b', sourceId: 'local' });
    expect(repo.getIcon(db, id)?.path).toBe('/icons/b.webp');
    expect(repo.iconMap(db)).toEqual({ 'w:АК-12': '/icons/b.webp' });
  });

  it('records commit metadata on a source', () => {
    seed.markSourceOk(db, 'exbo_base', {
      at: '2026-01-01T00:00:00.000Z',
      commit: 'abc',
      commitDate: '2025-12-31T00:00:00.000Z',
    });
    expect(repo.getSource(db, 'exbo_base')).toMatchObject({
      status: 'ok',
      last_ok_at: '2026-01-01T00:00:00.000Z',
      commit_sha: 'abc',
      commit_date: '2025-12-31T00:00:00.000Z',
    });
  });
});
