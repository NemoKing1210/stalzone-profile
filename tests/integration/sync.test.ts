import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, loadConfig, migrate, openDb, type Db } from '@dossier/core';
import { itemStats, listItems, upsertItem } from '@dossier/core/repo';
import { getCharacter } from '@dossier/core/repo/characters';
import { runSync } from '@dossier/core/services/sync';
import { parseExboItem, exboAdapter, motifsAdapter, wikiAdapter } from '@dossier/sources';

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
          name: {
            key: 'core.tooltip.stat_name.damage_type.direct',
            lines: { ru: 'Урон' },
          },
          value: 40,
        },
        {
          type: 'range',
          name: {
            key: 'weapon.tooltip.weapon.info.distance',
            lines: { ru: 'Дистанция' },
          },
          min: 100,
          max: 400,
        },
        {
          type: 'key-value',
          key: {
            key: 'weapon.tooltip.weapon.info.ammo_type',
            lines: { ru: 'Калибр' },
          },
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
  exbo_id: 'wg901',
  category: 'artefact/thermal',
  color: 'DEFAULT',
  name: { key: 'item.art.test.name', lines: { ru: 'Тест-артефакт', en: 'Test artifact' } },
  stats: [
    {
      key: 'stalker.artefact_properties.factor.stamina_bonus',
      type: 'range',
      value: { min: 8.22, max: 9.67, calculated: 0 },
      is_positive: true,
      is_percentage: true,
      name: { lines: { ru: 'Выносливость' } },
    },
  ],
  additionalStats: [
    {
      key: 'stalker.artefact_properties.factor.health_bonus',
      value: { calculated: 5 },
      is_positive: true,
      name: { lines: { ru: 'Здоровье' } },
    },
  ],
};

const WIKI_WEAPON = {
  exbo_id: 'wg902',
  category: 'weapon/assault_rifle',
  color: 'DEFAULT',
  name: { key: 'item.wpn.test.name', lines: { ru: 'Тест-винтовка', en: 'Test rifle' } },
  stats: [
    {
      key: 'weapon.tooltip.weapon.info.rate_of_fire',
      value: { calculated: 600 },
      name: { lines: { ru: 'Скорострельность' } },
    },
  ],
};

const TTK_WEAPON = {
  exbo_id: 'wg902',
  category: 'weapon/assault_rifle',
  color: 'DEFAULT',
  name: { key: 'item.wpn.test.name', lines: { ru: 'Тест-винтовка', en: 'Test rifle' } },
  damageVariants: {
    startDamageVariants: Array.from({ length: 16 }, (_, level) => 40 + level),
    endDamageVariants: Array.from({ length: 16 }, (_, level) => 20 + level),
    damageDecreaseStartVariants: Array.from({ length: 16 }, () => 50),
    damageDecreaseEndVariants: Array.from({ length: 16 }, () => 300),
    maxDistanceVariants: Array.from({ length: 16 }, () => 500),
  },
  clipSize: 30,
  stats: [],
};

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-sync-'));
  const cfg = loadConfig({
    dbPath: path.join(dir, 'test.db'),
    seedsDir: path.join(process.cwd(), 'db', 'seeds'),
  });
  db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
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
    const calls = { commit: 0, tree: 0, raw: 0 };
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
    expect(calls.raw).toBe(1);

    const second = await exboAdapter.fetch({ cacheDir, fetchImpl });
    expect(second.cached).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(calls.commit).toBe(2);
    expect(calls.tree).toBe(1);
    expect(calls.raw).toBe(1);
  });
});

describe('wiki adapter', () => {
  it('keeps ranges, additional stats and every TTK level', async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes('builds-calculator/items') && url.includes('category=artefact')) {
        return jsonResponse([WIKI_ARTIFACT]);
      }
      if (url.includes('builds-calculator/items') && url.includes('category=weapon')) {
        return jsonResponse([WIKI_WEAPON]);
      }
      if (url.includes('ttk-calculator/items') && url.includes('category=weapon')) {
        return jsonResponse([TTK_WEAPON]);
      }
      if (url.includes('builds-calculator/items')) return jsonResponse([]);
      throw new Error(`unexpected url ${url}`);
    };

    const snapshot = await wikiAdapter.fetch({ fetchImpl });
    expect(snapshot.artefact).toHaveLength(1);
    expect(snapshot.ttkWeapon).toHaveLength(1);

    const result = await runSync(db, 'wiki', { fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.items).toBeGreaterThanOrEqual(3);

    const artifact = listItems(db, 'artifact').find((item) => item.name === 'Тест-артефакт');
    expect(artifact).toBeTruthy();
    const artifactStats = itemStats(db, artifact!.id);
    expect(artifactStats.find((stat) => stat.key === 'stamina_bonus')).toMatchObject({
      value_min: 8.22,
      value_max: 9.67,
      value_num: null,
      pct: 1,
      positive: 1,
    });
    expect(artifactStats.find((stat) => stat.key === 'health_bonus')).toMatchObject({
      value_num: 5,
      is_additional: 1,
    });

    const weapon = listItems(db, 'weapon').find((item) => item.name === 'Тест-винтовка');
    expect(weapon).toBeTruthy();
    const levels = itemStats(db, weapon!.id)
      .filter((stat) => stat.key === 'damage.start')
      .map((stat) => stat.level)
      .sort((a, b) => Number(a) - Number(b));
    expect(levels).toEqual(Array.from({ length: 16 }, (_, level) => level));
  });
});

describe('motifs adapter', () => {
  it('refreshes base_item_id for all 219 motifs', async () => {
    const map = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'db', 'seeds', 'wiki', 'motifs-map.json'), 'utf8'),
    ) as { rows: { skin: string; key: string; token: string }[] };
    expect(map.rows).toHaveLength(219);

    const baseId = upsertItem(db, {
      sourceId: 'local',
      exboId: 'local:weapon:fn-fal',
      name: 'FN FAL',
      nameEn: 'FN FAL',
      kind: 'weapon',
      category: 'weapon/assault_rifle',
      raw: {},
    });
    for (const row of map.rows) {
      upsertItem(db, {
        sourceId: 'local',
        exboId: `motif:${row.token}`,
        name: row.skin,
        kind: 'motif',
        category: 'other',
        isCosmetic: true,
        raw: { motif: row },
      });
    }

    const fetchImpl = async (url: string) => {
      if (!url.includes('category=other')) throw new Error(`unexpected url ${url}`);
      return jsonResponse(
        map.rows.map((row) => ({
          category: 'other',
          name: { key: row.key, lines: { ru: row.skin } },
        })),
      );
    };

    const rows = await motifsAdapter.fetch({ fetchImpl });
    expect(rows).toHaveLength(219);

    const result = await runSync(db, 'motifs', { fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.items).toBe(219);

    const falMotif = db
      .prepare(`SELECT id, base_item_id FROM item WHERE kind = 'motif' AND name_norm = ?`)
      .get('родной двор') as { id: number; base_item_id: number | null } | undefined;
    expect(falMotif?.base_item_id).toBe(baseId);
  });
});

describe('profile adapter', () => {
  it('updates the character snapshot from the manual profile file', async () => {
    const file = path.join(dir, 'profile.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        username: 'Nemo_King',
        fetched: '2026-11-15',
        source: 'https://sctools.tech/en/players/Nemo_King',
        region: 'RU',
        faction: 'Duty',
        playtimeHours: 1000,
        kd: 0.31,
        accuracy: 56,
        headshotShare: 85,
        achievementPoints: 1301,
        stats: { survival: { Kills: 1 } },
      }),
    );
    db.prepare(
      `INSERT INTO character (nick, realm, updated_at) VALUES ('Nemo_King', 'ru', '2026-11-01T00:00:00Z')`,
    ).run();

    const result = await runSync(db, 'profile', { profileFile: file });
    expect(result.status).toBe('ok');
    expect(result.items).toBe(1);

    const character = getCharacter(db);
    expect(character?.hours).toBe(1000);
    const stats = JSON.parse(character?.stats ?? '{}') as {
      profile?: { username?: string };
      profileMeta?: { fetched?: string };
    };
    expect(stats.profile?.username).toBe('Nemo_King');
    expect(stats.profileMeta?.fetched).toBe('2026-11-15');
  });
});

describe('sync failure', () => {
  it('marks a failed source stale and keeps the previous data', async () => {
    await runSync(db, 'exbo_base', {
      cacheDir: path.join(dir, 'cache-fail'),
      fetchImpl: async () => jsonResponse({ message: 'boom' }, 500),
    });

    const source = db.prepare(`SELECT status, last_error FROM source WHERE id = 'exbo_base'`).get() as {
      status: string;
      last_error: string | null;
    };
    expect(source.status).toBe('stale');
    expect(source.last_error).toContain('500');
  });
});
