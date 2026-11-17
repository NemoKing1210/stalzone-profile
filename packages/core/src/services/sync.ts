import path from 'node:path';
import { norm } from '@dossier/shared';
import {
  exboAdapter,
  motifsAdapter,
  scpmodelAdapter,
  wikiAdapter,
  type FetchLike,
  type MotifRow,
  type PriceRow,
} from '@dossier/sources';
import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';
import { exboStats, localExboId, ttkStats, wikiEffects, wikiStats } from './normalize.js';

type Json = Record<string, any>;

export const SYNC_SOURCES = ['exbo_base', 'wiki', 'motifs', 'scpmodel'] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export type SyncStatus = 'ok' | 'stale';

export interface SyncResult {
  source: SyncSource;
  status: SyncStatus;
  items: number;
  commit?: string | null;
  fetchedAt?: string | null;
  error?: string;
  ageMin?: number;
  cached?: boolean;
}

export interface SyncOptions {
  force?: boolean;
  cacheDir?: string;
  fetchImpl?: FetchLike;
  realm?: string;
  now?: number;
}

/** Aliases used by MCP clients and the CLI. */
export function normalizeSource(source: string): SyncSource | 'all' {
  if (source === 'all') return 'all';
  if (source === 'exbo') return 'exbo_base';
  if ((SYNC_SOURCES as readonly string[]).includes(source)) return source as SyncSource;
  throw new Error(`unknown source: ${source}`);
}

/** Age of the newest price quote in minutes; Infinity when there is none. */
export function pricesAgeMin(db: Db, now = Date.now()): number {
  const at = repo.latestPriceFetchedAt(db);
  if (!at) return Infinity;
  const time = new Date(at).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return Math.max(0, Math.round((now - time) / 60_000));
}

export function runSyncAll(db: Db, options: SyncOptions = {}): Promise<SyncResult[]> {
  return SYNC_SOURCES.reduce<Promise<SyncResult[]>>(async (previous, source) => {
    const results = await previous;
    results.push(await runSync(db, source, options));
    return results;
  }, Promise.resolve([]));
}

/* ------------------------------- helpers ------------------------------- */

function sourceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cacheDir(options: SyncOptions): string {
  return options.cacheDir ?? path.resolve(process.cwd(), 'data', 'cache');
}

function alnum(value: string): string {
  return norm(value).replace(/[^a-zа-я0-9]/g, '');
}

/**
 * The cosmetic token (`ks1_ssop`, `fal_summer25`) is the only source of the
 * base item. Try the full token, the seasonal suffix stripped and the first
 * segment; match exact, prefix and finally substring. Unknown stays null.
 */
function resolveMotifBase(db: Db, row: MotifRow): number | null {
  if (!row.kind) return null;
  const candidates = [
    row.token,
    row.token.replace(/_(?:summer|winter|autumn|spring|halloween|newyear)\d*$/i, ''),
    row.token.split('_')[0] ?? '',
  ]
    .map(alnum)
    .filter((candidate, index, list) => candidate.length >= 3 && list.indexOf(candidate) === index);
  if (!candidates.length) return null;

  const items = db
    .prepare(`SELECT id, name_norm, name_en_norm FROM item WHERE kind = ? ORDER BY id`)
    .all(row.kind) as { id: number; name_norm: string; name_en_norm: string }[];

  for (const candidate of candidates) {
    const exact = items.find(
      (item) => alnum(item.name_norm) === candidate || alnum(item.name_en_norm) === candidate,
    );
    if (exact) return exact.id;
  }
  for (const candidate of candidates) {
    const prefix = items.find(
      (item) =>
        alnum(item.name_norm).startsWith(candidate) || alnum(item.name_en_norm).startsWith(candidate),
    );
    if (prefix) return prefix.id;
  }
  for (const candidate of candidates) {
    const partial = items.find(
      (item) =>
        alnum(item.name_norm).includes(candidate) || alnum(item.name_en_norm).includes(candidate),
    );
    if (partial) return partial.id;
  }
  return null;
}

function upsertWikiRecord(
  db: Db,
  record: Json,
  kind: string,
  stats: ReturnType<typeof wikiStats>,
): boolean {
  const name = record?.name?.lines?.ru;
  if (!name) return false;
  const itemId = repo.upsertItem(db, {
    sourceId: 'wiki',
    externalId: record.exbo_id ?? localExboId(kind, name),
    name,
    nameEn: record?.name?.lines?.en ?? null,
    kind,
    category: record.category ?? null,
    rank: record.color ?? null,
  });
  repo.replaceItemStats(db, itemId, stats, 'wiki');
  repo.replaceItemEffects(db, itemId, wikiEffects(record));
  return true;
}

/* ------------------------------- per source ------------------------------- */

function syncExbo(db: Db, options: SyncOptions): Promise<SyncResult> {
  return exboAdapter
    .fetch({
      cacheDir: cacheDir(options),
      force: options.force,
      realm: options.realm,
      fetchImpl: options.fetchImpl,
    })
    .then((snapshot) => {
      const labels = snapshot.labels;
      db.transaction(() => {
        for (const stat of snapshot.stats) {
          repo.upsertStatDefinition(db, {
            id: stat.id,
            category: stat.category,
            valueType: stat.type,
            labelRu: stat.labelRu,
            labelEn: stat.labelEn,
          });
        }
        for (const record of snapshot.items) {
          const kind = repo.kindFromCategory(record.cat);
          const itemId = repo.upsertItem(db, {
            sourceId: 'exbo_base',
            externalId: record.id,
            name: record.ru ?? record.id,
            nameEn: record.en,
            kind,
            category: record.cat,
            rank: record.rank,
            slot:
              typeof record.st['kv:weapon.tooltip.weapon.info.weapon_type'] === 'string'
                ? (record.st['kv:weapon.tooltip.weapon.info.weapon_type'] as string)
                : null,
            weight:
              typeof record.st['core.tooltip.info.weight'] === 'number'
                ? (record.st['core.tooltip.info.weight'] as number)
                : null,
          });
          repo.replaceItemStats(db, itemId, exboStats(record, labels), 'exbo_base');
        }
      })();
      repo.markSourceOk(db, 'exbo_base', {
        at: snapshot.fetchedAt,
        commit: snapshot.commit,
        commitDate: snapshot.commitDate,
      });
      return {
        source: 'exbo_base' as const,
        status: 'ok' as const,
        items: snapshot.items.length,
        commit: snapshot.commit,
        fetchedAt: snapshot.fetchedAt,
        cached: snapshot.cached,
      };
    });
}

async function syncWiki(db: Db, options: SyncOptions): Promise<SyncResult> {
  const snapshot = await wikiAdapter.fetch({ fetchImpl: options.fetchImpl });
  let items = 0;
  db.transaction(() => {
    const groups: [string, Json[]][] = [
      ['weapon', snapshot.weapon],
      ['armor', snapshot.armor],
      ['artifact', snapshot.artefact],
      ['container', snapshot.containers],
      ['attachment', snapshot.attachment],
      ['other', snapshot.consumable],
    ];
    for (const [kind, list] of groups) {
      for (const record of list) {
        if (upsertWikiRecord(db, record, kind, wikiStats(record, {}))) items++;
      }
    }
    for (const record of snapshot.ttkWeapon) {
      if (upsertWikiRecord(db, record, 'weapon', ttkStats(record))) items++;
    }
  })();
  return { source: 'wiki', status: 'ok', items, fetchedAt: snapshot.fetchedAt };
}

async function syncMotifs(db: Db, options: SyncOptions): Promise<SyncResult> {
  const rows = await motifsAdapter.fetch({ fetchImpl: options.fetchImpl });
  const now = new Date().toISOString();
  const findMotif = db.prepare(`SELECT id FROM item WHERE kind = 'motif' AND name_norm = ? LIMIT 1`);
  db.transaction(() => {
    for (const row of rows) {
      const motif = findMotif.get(norm(row.skin)) as { id: number } | undefined;
      if (!motif) continue;
      const baseItemId = resolveMotifBase(db, row);
      if (baseItemId == null) continue;
      db.prepare(`UPDATE item SET base_item_id = ?, updated_at = ? WHERE id = ?`).run(baseItemId, now, motif.id);
    }
  })();
  return {
    source: 'motifs',
    status: 'ok',
    items: rows.length,
    fetchedAt: new Date().toISOString(),
  };
}

function priceInput(db: Db, row: PriceRow): repo.PriceQuoteInput {
  const item = row.exboId ? repo.getItemByExternalId(db, row.exboId) : null;
  return {
    itemId: item?.id ?? null,
    exboId: row.exboId,
    name: row.name,
    quality: row.quality,
    bonus: row.bonus,
    lotPrice: row.lotPrice,
    lotCount: row.lotCount,
    currentPrice: row.currentPrice,
    lastTrade: row.lastTrade,
    lotUpdatedAt: row.lotUpdatedAt,
    sourceId: 'scpmodel',
  };
}

async function syncPrices(db: Db, options: SyncOptions): Promise<SyncResult> {
  const lastAt = repo.latestPriceFetchedAt(db);
  const ageMin = pricesAgeMin(db, options.now);
  if (!options.force && lastAt && ageMin < 15) {
    return { source: 'scpmodel', status: 'ok', items: 0, fetchedAt: lastAt, ageMin };
  }

  const snapshot = await scpmodelAdapter.fetch({
    region: options.realm ?? 'ru',
    fetchImpl: options.fetchImpl,
  });
  const inputs = snapshot.rows.map((row) => priceInput(db, row));
  repo.insertPriceQuotes(db, inputs);
  return {
    source: 'scpmodel',
    status: 'ok',
    items: inputs.length,
    fetchedAt: snapshot.fetchedAt,
    ageMin: 0,
  };
}

/* ------------------------------- entry point ------------------------------- */

/**
 * Runs one source and records its freshness. Any failure marks the source
 * `stale` and leaves the previous snapshot untouched.
 */
export async function runSync(db: Db, source: string, options: SyncOptions = {}): Promise<SyncResult> {
  const normalized = normalizeSource(source);
  if (normalized === 'all') throw new Error('runSync accepts one source; use runSyncAll');

  repo.ensureSource(db, normalized);
  repo.markSourceTry(db, normalized);

  try {
    let result: SyncResult;
    switch (normalized) {
      case 'exbo_base':
        result = await syncExbo(db, options);
        break;
      case 'wiki':
        result = await syncWiki(db, options);
        break;
      case 'motifs':
        result = await syncMotifs(db, options);
        break;
      case 'scpmodel':
        result = await syncPrices(db, options);
        break;
    }
    if (result.fetchedAt) repo.markSourceOk(db, normalized, { at: result.fetchedAt });
    return result;
  } catch (error) {
    const message = sourceError(error);
    repo.markSourceStale(db, normalized, message);
    return {
      source: normalized,
      status: 'stale',
      items: 0,
      fetchedAt: repo.getSource(db, normalized)?.last_ok_at ?? null,
      error: message,
      ...(normalized === 'scpmodel' ? { ageMin: pricesAgeMin(db, options.now) } : {}),
    };
  }
}
