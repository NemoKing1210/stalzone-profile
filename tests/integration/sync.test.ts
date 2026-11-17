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

  it('creates a motif row when the database has none', async () => {
    const baseId = repo.upsertItem(db, {
      sourceId: 'local',
      externalId: 'local:weapon:ks-1',
      name: 'KS-1',
      nameEn: 'KS-1',
      kind: 'weapon',
      category: 'weapon/shotgun_rifle',
    });
    expect(repo.findItemByKindName(db, 'motif', 'Родной двор')).toBeNull();

    const fetchImpl = async (url: string) => {
      if (!url.includes('category=other')) throw new Error(`unexpected url ${url}`);
      return jsonResponse([
        { category: 'other', name: { key: 'item.motif.wpn.ks1_ssop.name', lines: { ru: 'Родной двор' } } },
      ]);
    };

    const result = await runSync(db, 'motifs', { fetchImpl });
    expect(result).toMatchObject({ status: 'ok', items: 1 });

    const motif = repo.findItemByKindName(db, 'motif', 'Родной двор');
    expect(motif).not.toBeNull();
    expect(motif?.base_item_id).toBe(baseId);
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM item WHERE kind = 'motif'`).get() as { c: number },
    ).toEqual({ c: 1 });
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

describe('unknown source', () => {
  it('rejects a source that no adapter serves', async () => {
    await expect(runSync(db, 'seeds')).rejects.toThrow(/unknown source/);
  });
});

describe('icons sync', () => {
  const cacheDir = () => path.join(dir, 'cache');

  function exboFetch(icon: () => Promise<Response>, realm = 'ru'): (url: string) => Promise<Response> {
    return async (url: string) => {
      if (url.endsWith('/commits/main')) {
        return jsonResponse({ sha: 'abc123', commit: { committer: { date: '2026-11-14T10:00:00Z' } } });
      }
      if (url.includes('/git/trees/main')) {
        return jsonResponse({ tree: [{ path: `${realm}/items/weapon/wg53.json` }] });
      }
      if (url.endsWith(`/${realm}/stats.json`)) return jsonResponse([]);
      if (url.includes('/icons/')) return icon();
      if (url.includes('raw.githubusercontent.com')) return jsonResponse(EXBO_ITEM);
      throw new Error(`unexpected url ${url}`);
    };
  }

  it('downloads icons once and skips existing files on the next run', async () => {
    const iconsDir = path.join(dir, 'icons');
    const calls = { icon: 0 };
    const fetchImpl = exboFetch(async () => {
      calls.icon += 1;
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    });
    await runSync(db, 'exbo_base', { fetchImpl, cacheDir: cacheDir() });

    const first = await runSync(db, 'icons', { fetchImpl, cacheDir: cacheDir(), iconsDir });
    expect(first).toMatchObject({ source: 'icons', status: 'ok', icons: 1 });

    const item = repo.findItemByKindName(db, 'weapon', 'АК-12')!;
    const icon = repo.getIcon(db, item.id)!;
    expect(icon.mime).toBe('image/png');
    expect(icon.path).toMatch(/^\/icons\/[a-f0-9]{40}\.png$/);
    expect(fs.existsSync(path.join(iconsDir, path.basename(icon.path)))).toBe(true);

    const second = await runSync(db, 'icons', { fetchImpl, cacheDir: cacheDir(), iconsDir });
    expect(second).toMatchObject({ status: 'ok', icons: 0 });
    expect(calls.icon).toBe(1);
  });

  it('downloads an icon again when its file disappeared', async () => {
    const iconsDir = path.join(dir, 'icons');
    const calls = { icon: 0 };
    const fetchImpl = exboFetch(async () => {
      calls.icon += 1;
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    });
    await runSync(db, 'exbo_base', { fetchImpl, cacheDir: cacheDir() });
    await runSync(db, 'icons', { fetchImpl, cacheDir: cacheDir(), iconsDir });

    const item = repo.findItemByKindName(db, 'weapon', 'АК-12')!;
    const file = path.join(iconsDir, path.basename(repo.getIcon(db, item.id)!.path));
    fs.rmSync(file);

    const again = await runSync(db, 'icons', { fetchImpl, cacheDir: cacheDir(), iconsDir });
    expect(again).toMatchObject({ status: 'ok', icons: 1 });
    expect(calls.icon).toBe(2);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('refuses to report an empty catalog as a successful icon sync', async () => {
    const fetchImpl = exboFetch(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }));

    const result = await runSync(db, 'icons', { fetchImpl, cacheDir: cacheDir(), iconsDir: path.join(dir, 'icons') });

    expect(result).toMatchObject({ source: 'icons', status: 'stale', icons: 0 });
    expect(result.error).toContain('exbo_base');
  });

  it('downloads icons for an EU catalog into the EU realm', async () => {
    const iconsDir = path.join(dir, 'icons');
    const fetchImpl = exboFetch(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }), 'eu');
    await runSync(db, 'exbo_base', { fetchImpl, cacheDir: cacheDir(), realm: 'eu' });

    const result = await runSync(db, 'icons', { fetchImpl, cacheDir: cacheDir(), iconsDir, realm: 'eu' });

    expect(result).toMatchObject({ source: 'icons', status: 'ok', icons: 1 });
  });

  it('reports stale when every icon download fails', async () => {
    const fetchImpl = exboFetch(async () => new Response('no', { status: 404 }));
    await runSync(db, 'exbo_base', { fetchImpl, cacheDir: cacheDir() });

    const result = await runSync(db, 'icons', {
      fetchImpl,
      cacheDir: cacheDir(),
      iconsDir: path.join(dir, 'icons'),
    });
    expect(result).toMatchObject({ source: 'icons', status: 'stale', icons: 0, failed: 1 });
    expect(repo.getIcon(db, repo.findItemByKindName(db, 'weapon', 'АК-12')!.id)).toBeNull();
  });
});

describe('profile sync', () => {
  const profileApi = {
    clientId: 'id',
    clientSecret: 'secret',
    apiUrl: 'https://api.test',
    tokenUrl: 'https://auth.test/oauth/token',
  };

  function profileFetch(profiles: unknown[]): { fetchImpl: (url: string) => Promise<Response>; calls: { token: number; profile: number } } {
    const calls = { token: 0, profile: 0 };
    return {
      calls,
      fetchImpl: async (url: string) => {
        if (url === profileApi.tokenUrl) {
          calls.token += 1;
          return jsonResponse({ access_token: 'token', expires_in: 3600 });
        }
        if (url.includes('/character/by-name/')) {
          calls.profile += 1;
          return jsonResponse(profiles[Math.min(calls.profile - 1, profiles.length - 1)]);
        }
        throw new Error(`unexpected url ${url}`);
      },
    };
  }

  it('writes API stats, keeps manual overrides and drops removed stats', async () => {
    const characterId = repo.upsertCharacter(db, { nick: 'Nemo_King', region: 'ru' });
    repo.setCharacterStat(db, characterId, 'kil', 99, 'manual');

    const full = {
      username: 'Nemo_King',
      alliance: 'Duty',
      clan: { info: { name: 'Clan' }, member: { rank: 'Officer' } },
      stats: [
        { id: 'kil', type: 'INTEGER', value: 10 },
        { id: 'dea', type: 'INTEGER', value: 4 },
        { id: 'pla-tim', type: 'DURATION', value: 'PT100H' },
        { id: 'reg-tim', type: 'DATE', value: '2024-01-02' },
      ],
    };
    const withoutDea = { ...full, stats: full.stats.filter((stat) => stat.id !== 'dea') };
    const { fetchImpl, calls } = profileFetch([full, withoutDea]);

    const first = await runSync(db, 'profile', { fetchImpl, profileApi });
    expect(first).toMatchObject({ source: 'profile', status: 'ok' });

    const stats = repo.characterStatMap(db, characterId);
    expect(stats.kil).toMatchObject({ value_num: 99, origin: 'manual' });
    expect(stats.dea).toMatchObject({ value_num: 4, origin: 'api' });
    expect(stats['pla-tim']).toMatchObject({ value_num: 100, origin: 'api' });
    expect(stats['reg-tim']).toMatchObject({ value_text: '2024-01-02', origin: 'api' });
    expect(repo.getCharacter(db)).toMatchObject({
      clan_name: 'Clan',
      clan_rank: 'Officer',
      alliance: 'Duty',
    });
    expect(repo.getCharacter(db)?.profile_fetched_at).toBeTruthy();

    await runSync(db, 'profile', { fetchImpl, profileApi });
    expect(calls.token).toBe(2);
    expect(calls.profile).toBe(2);
    const after = repo.characterStatMap(db, characterId);
    expect(after.dea).toBeUndefined();
    expect(after.kil).toMatchObject({ value_num: 99, origin: 'manual' });
  });

  it('sends OAuth client credentials and an uppercase, encoded profile request', async () => {
    const nick = 'Nemo King/Тест';
    repo.upsertCharacter(db, { nick, region: 'eu' });
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      if (url === profileApi.tokenUrl) return jsonResponse({ access_token: 'tok', expires_in: 3600 });
      return jsonResponse({ username: nick, stats: [] });
    };

    await runSync(db, 'profile', { fetchImpl, profileApi });

    expect(seen).toHaveLength(2);
    const [token, profile] = seen;
    expect(token.url).toBe(profileApi.tokenUrl);
    expect(token.init?.method).toBe('POST');
    expect((token.init?.headers as Record<string, string>)['content-type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = new URLSearchParams(String(token.init?.body));
    expect(body.get('client_id')).toBe('id');
    expect(body.get('client_secret')).toBe('secret');
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('');

    expect(profile.url).toBe(
      `https://api.test/EU/character/by-name/${encodeURIComponent(nick)}/profile`,
    );
    expect((profile.init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('keeps the previous API rows when a 2xx profile response has no stats array', async () => {
    const characterId = repo.upsertCharacter(db, { nick: 'Nemo_King', region: 'ru' });
    const full = {
      username: 'Nemo_King',
      stats: [
        { id: 'kil', type: 'INTEGER', value: 10 },
        { id: 'dea', type: 'INTEGER', value: 4 },
      ],
    };
    const { fetchImpl } = profileFetch([full, { username: 'Nemo_King' }]);

    await runSync(db, 'profile', { fetchImpl, profileApi });
    expect(repo.characterStatMap(db, characterId).dea).toMatchObject({ value_num: 4, origin: 'api' });

    const degraded = await runSync(db, 'profile', { fetchImpl, profileApi });
    expect(degraded).toMatchObject({ source: 'profile', status: 'stale' });
    expect(repo.characterStatMap(db, characterId).dea).toMatchObject({ value_num: 4, origin: 'api' });
    expect(repo.characterStatMap(db, characterId).kil).toMatchObject({ value_num: 10, origin: 'api' });
  });

  it('reports stale without credentials or a character', async () => {
    repo.upsertCharacter(db, { nick: 'Nemo_King', region: 'ru' });
    const noCreds = await runSync(db, 'profile', { fetchImpl: async () => jsonResponse({}) });
    expect(noCreds).toMatchObject({ status: 'stale', error: 'STALZONE_API_NOT_CONFIGURED' });

    db.prepare(`DELETE FROM character`).run();
    const noCharacter = await runSync(db, 'profile', {
      fetchImpl: async () => jsonResponse({}),
      profileApi,
    });
    expect(noCharacter.status).toBe('stale');
    expect(repo.getCharacter(db)).toBeNull();
  });
});
