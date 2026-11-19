import { norm } from '@profile/shared';
import { cachedStatement, type Db } from '../../../platform/db/index.js';

export interface PriceQuoteInput {
  itemId?: number | null;
  exboId?: string | null;
  name: string;
  quality?: string | null;
  bonus?: number | null;
  lotPrice?: number | null;
  lotCount?: number | null;
  currentPrice?: number | null;
  lastTrade?: number | null;
  lotUpdatedAt?: string | null;
  sourceId?: string;
  fetchedAt?: string;
}

export interface PriceRow {
  id: number;
  item_id: number | null;
  external_id: string | null;
  name: string;
  name_norm: string;
  quality: string | null;
  quality_norm: string;
  bonus: number | null;
  lot_price: number | null;
  lot_count: number | null;
  current_price: number | null;
  last_trade: number | null;
  lot_updated_at: string | null;
  source_id: string;
  fetched_at: string;
}

const INSERT_QUOTE = `INSERT INTO price_quote
  (item_id, external_id, name, name_norm, quality, quality_norm, bonus,
   lot_price, lot_count, current_price, last_trade, lot_updated_at, source_id, fetched_at)
 VALUES (@item_id, @external_id, @name, @name_norm, @quality, @quality_norm, @bonus,
   @lot_price, @lot_count, @current_price, @last_trade, @lot_updated_at, @source_id, @fetched_at)`;

export function insertPriceQuote(db: Db, row: PriceQuoteInput): number {
  const info = cachedStatement(db, INSERT_QUOTE)
    .run({
      item_id: row.itemId ?? null,
      external_id: row.exboId ?? null,
      name: row.name,
      name_norm: norm(row.name),
      quality: row.quality ?? null,
      quality_norm: norm(row.quality ?? ''),
      bonus: row.bonus ?? null,
      lot_price: row.lotPrice ?? null,
      lot_count: row.lotCount ?? null,
      current_price: row.currentPrice ?? null,
      last_trade: row.lastTrade ?? null,
      lot_updated_at: row.lotUpdatedAt ?? null,
      source_id: row.sourceId ?? 'scpmodel',
      fetched_at: row.fetchedAt ?? new Date().toISOString(),
    });
  return Number(info.lastInsertRowid);
}

/**
 * Keeps the newest quote per name/quality/bonus. The read model only ever uses
 * the latest row, so older snapshots are dead weight that slows `price_latest`.
 */
export function prunePriceHistory(db: Db): number {
  return db
    .prepare(
      `DELETE FROM price_quote
       WHERE id NOT IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (
             PARTITION BY name_norm, quality_norm, COALESCE(bonus, 0)
             ORDER BY fetched_at DESC, id DESC
           ) AS rn
           FROM price_quote
         ) WHERE rn = 1
       )`,
    )
    .run().changes;
}

export function insertPriceQuotes(db: Db, rows: PriceQuoteInput[]): number {
  const run = db.transaction(() => {
    for (const row of rows) insertPriceQuote(db, row);
    prunePriceHistory(db);
  });
  run();
  return rows.length;
}

export function latestPriceRows(db: Db, name: string, quality?: string | null): PriceRow[] {
  const params: unknown[] = [norm(name)];
  let sql = `SELECT * FROM price_latest WHERE name_norm = ?`;
  if (quality) {
    sql += ` AND quality_norm = ?`;
    params.push(norm(quality));
  }
  sql += ` ORDER BY COALESCE(lot_price, current_price, last_trade, 9223372036854775807) ASC`;
  return cachedStatement(db, sql).all(...params) as PriceRow[];
}

export function effectivePrice(row: PriceRow | null | undefined): number | null {
  if (!row) return null;
  return row.lot_price ?? row.current_price ?? row.last_trade ?? null;
}

export function bestPrice(db: Db, name: string, quality?: string | null): PriceRow | null {
  return latestPriceRows(db, name, quality)[0] ?? null;
}

const PRICE_NAME_CHUNK = 500;

/** Latest quotes grouped by the caller's original name string. */
export type PriceRowsByName = Record<string, PriceRow[]>;

/** One window scan per chunk of names instead of one scan per name. */
export function latestPricesForNames(db: Db, names: string[]): PriceRowsByName {
  const out: Record<string, PriceRow[]> = {};
  const namesByNorm = new Map<string, string[]>();
  for (const name of names) {
    out[name] ??= [];
    const key = norm(name);
    const list = namesByNorm.get(key) ?? [];
    list.push(name);
    namesByNorm.set(key, list);
  }

  const keys = [...namesByNorm.keys()];
  for (let offset = 0; offset < keys.length; offset += PRICE_NAME_CHUNK) {
    const chunk = keys.slice(offset, offset + PRICE_NAME_CHUNK);
    if (!chunk.length) continue;
    const placeholders = new Array(chunk.length).fill('?').join(', ');
    const rows = db
      .prepare(
        `SELECT * FROM price_latest WHERE name_norm IN (${placeholders})
         ORDER BY name_norm, COALESCE(lot_price, current_price, last_trade, 9223372036854775807) ASC`,
      )
      .all(...chunk) as PriceRow[];
    for (const row of rows) {
      for (const name of namesByNorm.get(row.name_norm) ?? []) out[name]?.push(row);
    }
  }
  return out;
}

export function countPrices(db: Db): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM price_quote`).get() as { c: number }).c;
}

export function latestPriceFetchedAt(db: Db): string | null {
  const row = db.prepare(`SELECT MAX(fetched_at) AS at FROM price_quote`).get() as { at: string | null };
  return row.at;
}
