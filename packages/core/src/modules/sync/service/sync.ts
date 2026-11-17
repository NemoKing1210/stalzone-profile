import fs from 'node:fs';
import path from 'node:path';
import { norm, sha1 } from '@dossier/shared';
import {
  exboAdapter,
  fetchStalzoneProfile,
  motifsAdapter,
  scpmodelAdapter,
  wikiAdapter,
  type FetchLike,
  type MotifRow,
  type PriceRow,
  type StalzoneApiOptions,
} from '@dossier/sources';
import type { Db } from '../../../platform/db/index.js';
import * as repo from '../../catalog/index.js';
import * as identity from '../../identity/index.js';
import * as sourceRepo from '../repo/sources.js';
import { readSyncSchedule } from '../repo/schedule.js';
import { ensureDir } from '../../../platform/config.js';
import { exboStats, localExboId, remoteIcon, ttkStats, wikiEffects, wikiStats } from './normalize.js';
import { mapProfileStats } from './profile.js';
import { SYNC_BUNDLES, dueSyncBundles, syncBundleStates } from './schedule.js';

type Json = Record<string, any>;

/** Sources `all` runs: public catalog data. `profile` is opt-in and never implicit. */
export const CATALOG_SOURCES = ['exbo_base', 'wiki', 'motifs', 'scpmodel', 'icons'] as const;
export const SYNC_SOURCES = [...CATALOG_SOURCES, 'profile'] as const;
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
  /** Icons written by the `icons` source. */
  icons?: number;
  /** Per-file icon failures; they do not fail the source. */
  failed?: number;
}

export interface SyncOptions {
  force?: boolean;
  cacheDir?: string;
  fetchImpl?: FetchLike;
  realm?: string;
  now?: number;
  iconsDir?: string;
  profileApi?: StalzoneApiOptions;
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

export async function runSyncSequence(
  db: Db,
  sources: readonly SyncSource[],
  options: SyncOptions = {},
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const source of sources) results.push(await runSync(db, source, options));
  return results;
}

export function runSyncAll(db: Db, options: SyncOptions = {}): Promise<SyncResult[]> {
  return runSyncSequence(db, CATALOG_SOURCES, options);
}

/**
 * Runs only due, ready bundles in a stable order. Callers own the single-flight lock;
 * source failures are already converted to `stale` by `runSync`, so this never throws
 * for a failed source.
 */
export async function runDueBundles(db: Db, options: SyncOptions = {}, now = Date.now()): Promise<SyncResult[]> {
  const schedule = readSyncSchedule(db);
  const character = identity.getCharacter(db);
  const runtime = {
    profileApiConfigured: Boolean(options.profileApi?.clientId && options.profileApi?.clientSecret),
    hasCharacter: character !== null,
    characterRegion: character?.region ?? null,
  };
  const states = syncBundleStates(schedule, sourceRepo.listSources(db), runtime, now);
  const results: SyncResult[] = [];
  for (const id of dueSyncBundles(states, now)) {
    results.push(...(await runSyncSequence(db, SYNC_BUNDLES[id], options)));
  }
  return results;
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

/**
 * Binds wiki numbers to the item EXBO created. EXBO owns identity, so an existing
 * row keeps its name, kind, category, rank and source; wiki only replaces its own
 * stats and the item's effect labels. A row that exists only in wiki is created
 * when the record carries data for it, and skipped when it does not.
 */
function bindWikiRecord(
  db: Db,
  record: Json,
  kind: string,
  stats: ReturnType<typeof wikiStats>,
  realm: string,
): boolean {
  const name = record?.name?.lines?.ru;
  if (!name) return false;
  const externalId = record.exbo_id ?? localExboId(kind, name);
  const effects = wikiEffects(record);
  const existing = repo.getItemByExternalId(db, externalId, realm);
  if (existing) {
    if (existing.kind !== kind) return false;
    repo.replaceItemStats(db, existing.id, stats, 'wiki');
    repo.replaceItemEffects(db, existing.id, effects);
    return true;
  }
  if (stats.length === 0 && effects.length === 0) return false;
  const itemId = repo.upsertItem(db, {
    sourceId: 'wiki',
    realm,
    externalId,
    name,
    nameEn: record?.name?.lines?.en ?? null,
    kind,
    category: record?.category ?? null,
    rank: record?.color ?? null,
  });
  repo.replaceItemStats(db, itemId, stats, 'wiki');
  repo.replaceItemEffects(db, itemId, effects);
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
            // The icons source looks items up by the same realm; keep both sides in step.
            realm: options.realm ?? 'ru',
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
      sourceRepo.markSourceOk(db, 'exbo_base', {
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
  const realm = options.realm ?? 'ru';
  let items = 0;
  db.transaction(() => {
    const groups: [string, Json[]][] = [
      ['armor', snapshot.armor],
      ['artifact', snapshot.artefact],
      ['container', snapshot.containers],
    ];
    for (const [kind, list] of groups) {
      for (const record of list) {
        if (bindWikiRecord(db, record, kind, wikiStats(record, {}), realm)) items++;
      }
    }
    for (const record of snapshot.ttkWeapon) {
      if (bindWikiRecord(db, record, 'weapon', ttkStats(record), realm)) items++;
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
      const baseItemId = resolveMotifBase(db, row);
      const existing = findMotif.get(norm(row.skin)) as { id: number } | undefined;
      if (!existing) {
        repo.upsertItem(db, {
          sourceId: 'motifs',
          externalId: row.key,
          name: row.skin,
          kind: 'motif',
          category: 'other',
          isCosmetic: true,
          baseItemId,
        });
        continue;
      }
      if (baseItemId == null) continue;
      db.prepare(`UPDATE item SET base_item_id = ?, updated_at = ? WHERE id = ?`).run(baseItemId, now, existing.id);
    }
  })();
  return {
    source: 'motifs',
    status: 'ok',
    items: rows.length,
    fetchedAt: new Date().toISOString(),
  };
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

const ICON_KINDS = new Set(['weapon', 'armor', 'artifact', 'container']);

/**
 * Downloads item icons from the EXBO repository snapshot. Existing files and
 * icon rows are skipped; a single failed file is counted, never fatal.
 */
async function syncIcons(db: Db, options: SyncOptions): Promise<SyncResult> {
  const realm = options.realm ?? 'ru';
  const snapshot = await exboAdapter.fetch({
    cacheDir: cacheDir(options),
    force: options.force,
    realm: options.realm,
    fetchImpl: options.fetchImpl,
  });
  const dir = ensureDir(options.iconsDir ?? path.resolve(process.cwd(), 'public', 'icons'));
  const fetchImpl = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));

  const targets: { itemId: number; url: string }[] = [];
  let known = 0;
  for (const record of snapshot.items) {
    const item = repo.getItemByExternalId(db, record.id, realm);
    if (!item || !ICON_KINDS.has(item.kind)) continue;
    known += 1;
    const existing = repo.getIcon(db, item.id);
    // A row without its file is a dangling path: download again instead of trusting the row.
    if (existing && fs.existsSync(path.join(dir, path.basename(existing.path)))) continue;
    const url = remoteIcon(record, realm);
    if (url) targets.push({ itemId: item.id, url });
  }

  let icons = 0;
  let failed = 0;
  await mapLimit(targets, 8, async ({ itemId, url }) => {
    const digest = sha1(url);
    const file = `${digest}.png`;
    try {
      const full = path.join(dir, file);
      if (!fs.existsSync(full)) {
        const response = await fetchImpl(url);
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        fs.writeFileSync(full, Buffer.from(await response.arrayBuffer()));
      }
      repo.upsertIcon(db, { itemId, path: `/icons/${file}`, mime: 'image/png', sha1: digest, sourceId: 'icons' });
      icons += 1;
    } catch {
      failed += 1;
    }
  });

  const fetchedAt = new Date().toISOString();
  if (known === 0) {
    return {
      source: 'icons',
      status: 'stale',
      items: 0,
      icons,
      failed,
      fetchedAt,
      error: 'no catalog items to match; sync exbo_base first',
    };
  }
  if (targets.length > 0 && icons === 0) {
    return {
      source: 'icons',
      status: 'stale',
      items: 0,
      icons,
      failed,
      fetchedAt,
      error: 'every icon download failed',
    };
  }
  return { source: 'icons', status: 'ok', items: icons, icons, failed, fetchedAt };
}

/**
 * Replaces only the API-owned statistics and keeps manual overrides. A stat
 * present in the previous pull but missing now disappears instead of going stale.
 */
async function syncProfile(db: Db, options: SyncOptions): Promise<SyncResult> {
  const api = options.profileApi;
  if (!api?.clientId || !api.clientSecret) throw new Error('STALZONE_API_NOT_CONFIGURED');

  const character = identity.getCharacter(db);
  if (!character) throw new Error('no character to sync a profile for');
  if (character.region === 'global') throw new Error('the profile API does not serve the global region');

  const profile = await fetchStalzoneProfile({
    ...api,
    nick: character.nick,
    region: character.region,
    fetchImpl: options.fetchImpl ?? ((url, init) => fetch(url, init)),
  });
  const { numeric, text } = mapProfileStats(profile.stats);
  const fetchedAt = new Date().toISOString();

  db.transaction(() => {
    for (const stat of identity.listCharacterStats(db, character.id)) {
      if (stat.origin === 'api') identity.clearCharacterStat(db, character.id, stat.stat_id, 'api');
    }
    for (const [statId, value] of Object.entries(numeric)) {
      identity.setCharacterStat(db, character.id, statId, value, 'api', fetchedAt);
    }
    for (const [statId, value] of Object.entries(text)) {
      identity.setCharacterStat(db, character.id, statId, value, 'api', fetchedAt);
    }
    identity.updateCharacterById(db, character.id, {
      alliance: profile.alliance,
      clan_name: profile.clan?.name ?? null,
      clan_rank: profile.clan?.rank ?? null,
      profile_fetched_at: fetchedAt,
    });
  })();

  return {
    source: 'profile',
    status: 'ok',
    items: Object.keys(numeric).length + Object.keys(text).length,
    fetchedAt,
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

  sourceRepo.ensureSource(db, normalized);
  sourceRepo.markSourceTry(db, normalized);

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
      case 'icons':
        result = await syncIcons(db, options);
        break;
      case 'profile':
        result = await syncProfile(db, options);
        break;
    }
    // A source can return `stale` with a timestamp (e.g. icons where every download
    // failed); freshness must follow the status, not the presence of `fetchedAt`.
    if (result.status === 'stale') sourceRepo.markSourceStale(db, normalized, result.error ?? null);
    else if (result.fetchedAt) sourceRepo.markSourceOk(db, normalized, { at: result.fetchedAt });
    return result;
  } catch (error) {
    const message = sourceError(error);
    sourceRepo.markSourceStale(db, normalized, message);
    return {
      source: normalized,
      status: 'stale',
      items: 0,
      fetchedAt: sourceRepo.getSource(db, normalized)?.last_ok_at ?? null,
      error: message,
      ...(normalized === 'scpmodel' ? { ageMin: pricesAgeMin(db, options.now) } : {}),
    };
  }
}
