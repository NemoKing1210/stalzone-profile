import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db } from '@dossier/core';
import * as repo from '@dossier/core';
import { exboAdapter, motifsAdapter, parseExboItem, wikiAdapter } from '@dossier/sources';
import { runSync } from '@dossier/core/services/sync';

const EXBO_ITEM = {
  id: 'wg53',
  category: 'weapon/assault_rifle',
  color: 'RANK_MASTER',
  name: { key: 'item.wpn.ak12.name', lines: { ru: 'АК-12', en: 'AK-12' } },
  infoBlocks: [
    {
      type: 'list',
      elements: [
        {
          type: 'numeric',
          name: { key: 'core.tooltip.stat_name.damage_type.direct', lines: { ru: 'Урон' } },
          value: 40,
        },
        {
          type: 'range',
          name: { key: 'weapon.tooltip.weapon.info.distance', lines: { ru: 'Дистанция' } },
          min: 100,
          max: 400,
        },
        {
          type: 'key-value',
          key: { key: 'weapon.tooltip.weapon.info.ammo_type', lines: { ru: 'Калибр' } },
          value: { lines: { ru: '5.56' } },
        },
        { type: 'text', text: { lines: { ru: 'Описание' } } },
      ],
    },
    {
      type: 'damage',
      startDamage: 40,
      damageDecreaseStart: 50,
      damageDecreaseEnd: 300,
      endDamage: 25,
      maxDistance: 500,
    },
  ],
};

const WIKI_ARTIFACT = {
  exbo_id: 'art-1',
  category: 'artefact/gravity',
  color: 'RANK_MASTER',
  name: { key: 'item.art.ner.name', lines: { ru: 'Нервяк', en: 'Nervyak' } },
  stats: [
    {
      key: 'stalker.artefact_properties.factor.speed_modifier',
      name: { lines: { ru: 'Скорость' } },
      value: { min: 0.5, max: 1 },
      is_positive: true,
      is_percentage: true,
    },
  ],
  additionalStats: [],
};

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-sync-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetch(routes: Record<string, unknown>): (url: string) => Promise<Response> {
  return async (url: string) => {
    for (const [key, body] of Object.entries(routes)) {
      if (url.includes(key)) return jsonResponse(body);
    }
    throw new Error(`unexpected url ${url}`);
  };
}

describe('EXBO adapter', () => {
  it('parses an item exactly like the legacy parser', () => {
    const labels: Record<string, string> = {};
    const record = parseExboItem(EXBO_ITEM, labels);

    expect(record).toMatchObject({
      id: 'wg53',
      cat: 'weapon/assault_rifle',
      ru: 'АК-12',
      en: 'AK-12',
      rank: 'RANK_MASTER',
    });
    expect(record.st['core.tooltip.stat_name.damage_type.direct']).toBe(40);
    expect(record.st['weapon.tooltip.weapon.info.distance']).toEqual([100, 400]);
    expect(record.st['kv:weapon.tooltip.weapon.info.ammo_type']).toBe('5.56');
    expect(record.dmg).toEqual({ sd: 40, ds: 50, ee: 300, ed: 25, max: 500 });
    expect(record.txt).toContain('Описание');
    expect(labels['core.tooltip.stat_name.damage_type.direct']).toBe('Урон');
  });

  it('skips the download when the repository commit is unchanged', async () => {
    const cacheDir = path.join(dir, 'cache');
    const calls = { commit: 0, tree: 0, raw: 0, stats: 0 };
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/commits/main')) {
        calls.commit += 1;
        return jsonResponse({ sha: 'abc123', commit: { committer: { date: '2026-11-14T10:00:00Z' } } });
      }
      if (url.includes('/git/trees/main')) {
        calls.tree += 1;
        return jsonResponse({
          tree: [
            { path: 'ru/items/weapon/wg53.json' },
            { path: 'ru/items/weapon/skins/wg53_skin.json' },
          ],
        });
      }
      if (url.endsWith('/ru/stats.json')) {
        calls.stats += 1;
        return jsonResponse([{ id: 'kil', category: 'SURVIVAL', type: 'INTEGER', name: { lines: { ru: 'Убийства' } } }]);
      }
      if (url.includes('raw.githubusercontent.com')) {
        calls.raw += 1;
        return jsonResponse(EXBO_ITEM);
      }
      throw new Error(`unexpected url ${url}`);
    };

    const first = await exboAdapter.fetch({ cacheDir, fetchImpl });
    expect(first.items).toHaveLength(1);
    expect(first.commit).toBe('abc123');
    expect(first.cached).toBe(false);
    expect(first.stats).toEqual([
      { id: 'kil', category: 'SURVIVAL', type: 'INTEGER', labelRu: 'Убийства', labelEn: null },
    ]);
    expect(calls.raw).toBe(1);

    const second = await exboAdapter.fetch({ cacheDir, fetchImpl });
    expect(second.cached).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(calls.commit).toBe(2);
    expect(calls.tree).toBe(1);
    expect(calls.raw).toBe(1);
    expect(calls.stats).toBe(1);
  });
});

describe('exbo_base sync', () => {
  it('writes typed items, stat definitions and commit metadata for exbo_base', async () => {
    const fetchImpl = fakeFetch({
      'commits/main': { sha: 'abc', commit: { committer: { date: '2026-01-01T00:00:00.000Z' } } },
      'git/trees/main?recursive=1': { tree: [{ path: 'ru/items/assault_rifle/ak-12.json' }] },
      'ru/items/assault_rifle/ak-12.json': EXBO_ITEM,
      'ru/stats.json': [
        { id: 'kil', category: 'SURVIVAL', type: 'INTEGER', name: { lines: { ru: 'Убийства', en: 'Kills' } } },
      ],
    });
    const result = await runSync(db, 'exbo_base', { fetchImpl, cacheDir: path.join(dir, 'cache') });
    expect(result).toMatchObject({ source: 'exbo_base', status: 'ok', items: 1, commit: 'abc' });
    const item = repo.findItemByKindName(db, 'weapon', 'АК-12')!;
    expect(repo.statValue(db, item.id, 'core.tooltip.stat_name.damage_type.direct')).toBe(40);
    expect(repo.getStatDefinition(db, 'kil')).toMatchObject({
      value_type: 'INTEGER',
      label_ru: 'Убийства',
      label_en: 'Kills',
    });
    expect(repo.getSource(db, 'exbo_base')).toMatchObject({ commit_sha: 'abc', status: 'ok' });
  });
});

describe('wiki sync', () => {
  it('writes wiki items with stat definitions and artifact effect lines', async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes('category=artefact')) return jsonResponse([WIKI_ARTIFACT]);
      if (url.includes('stalzone.wiki')) return jsonResponse([]);
      throw new Error(`unexpected url ${url}`);
    };
    const snapshot = await wikiAdapter.fetch({ fetchImpl });
    expect(snapshot.artefact).toHaveLength(1);

    await runSync(db, 'wiki', { fetchImpl });
    const item = repo.findItemByKindName(db, 'artifact', 'Нервяк')!;
    expect(repo.itemStats(db, item.id)[0]).toMatchObject({
      stat_id: 'speed_modifier',
      value_min: 0.5,
      value_max: 1,
    });
    expect(repo.listItemEffects(db, item.id)).toEqual([
      { item_id: item.id, position: 0, label: 'Скорость', is_positive: 1 },
    ]);
  });
});

describe('motifs sync', () => {
  it('refreshes base_item_id from the cosmetic token', async () => {
    const baseId = repo.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:weapon:fn-fal',
      name: 'FN FAL',
      nameEn: 'FN FAL',
      kind: 'weapon',
      category: 'weapon/assault_rifle',
    });
    repo.upsertItem(db, {
      sourceId: 'local',
      externalId: 'motif:1',
      name: 'Родной двор',
      kind: 'motif',
      category: 'other',
      isCosmetic: true,
    });

    const fetchImpl = async (url: string) => {
      if (!url.includes('category=other')) throw new Error(`unexpected url ${url}`);
      return jsonResponse([
        { category: 'other', name: { key: 'item.motif.wpn.fn-fal.name', lines: { ru: 'Родной двор' } } },
      ]);
    };

    const rows = await motifsAdapter.fetch({ fetchImpl });
    expect(rows).toHaveLength(1);

    const result = await runSync(db, 'motifs', { fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.items).toBe(1);

    const motif = db
      .prepare(`SELECT id, base_item_id FROM item WHERE kind = 'motif' AND name_norm = ?`)
      .get('родной двор') as { id: number; base_item_id: number | null } | undefined;
    expect(motif?.base_item_id).toBe(baseId);
  });
});

describe('scpmodel sync', () => {
  it('keeps the previous price and reports age when the source returns 500', async () => {
    const previous = new Date(Date.now() - 30 * 60_000).toISOString();
    repo.insertPriceQuote(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      lotPrice: 123,
      sourceId: 'scpmodel',
      fetchedAt: previous,
    });

    const result = await runSync(db, 'scpmodel', {
      fetchImpl: async () => jsonResponse({ detail: 'down' }, 500),
    });

    expect(result.status).toBe('stale');
    expect(result.error).toContain('500');
    expect(repo.bestPrice(db, 'Нервяк', 'Редкий')?.lot_price).toBe(123);
    expect(result.ageMin).toBeGreaterThanOrEqual(29);

    const source = db.prepare(`SELECT status, last_error FROM source WHERE id = 'scpmodel'`).get() as {
      status: string;
      last_error: string | null;
    };
    expect(source.status).toBe('stale');
    expect(source.last_error).toContain('500');
  });

  it('does not call the source inside the 15 minute TTL', async () => {
    repo.insertPriceQuote(db, {
      name: 'Нервяк',
      quality: 'Редкий',
      lotPrice: 123,
      sourceId: 'scpmodel',
      fetchedAt: new Date().toISOString(),
    });

    let calls = 0;
    const result = await runSync(db, 'scpmodel', {
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse([]);
      },
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('ok');
    expect(result.items).toBe(0);
    expect(result.ageMin).toBeLessThanOrEqual(1);
  });

  it('stores fresh rows and links them to known items', async () => {
    repo.upsertItem(db, {
      sourceId: 'local',
      externalId: 'wg1',
      name: 'Нервяк',
      kind: 'artifact',
      category: 'artefact/gravity',
    });

    const result = await runSync(db, 'scpmodel', {
      fetchImpl: async () =>
        jsonResponse([
          {
            item_key: 'wg1',
            item_id: 'wg1',
            name: 'Нервяк',
            qlt_label: 'Редкий',
            _qlt: 'rare',
            _bonus: 1,
            is_artifact: true,
            current_price: 110,
            min_lot: 100,
            lot_count: 3,
            last_trade_price: 105,
            lot_updated_at: '2026-11-15T10:00:00Z',
          },
        ]),
    });

    expect(result.status).toBe('ok');
    expect(result.items).toBe(1);
    const row = repo.bestPrice(db, 'Нервяк', 'Редкий');
    expect(row?.lot_price).toBe(100);
    expect(row?.item_id).toBeTruthy();
    expect(row?.lot_count).toBe(3);
  });
});

describe('removed source', () => {
  it('rejects the removed profile source', async () => {
    await expect(runSync(db, 'profile')).rejects.toThrow(/unknown source/);
  });
});
