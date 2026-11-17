import { norm } from '@profile/shared';
import type { Db } from '../../../platform/db/index.js';

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

export function insertPriceQuote(db: Db, row: PriceQuoteInput): number {
  const info = db
    .prepare(
      `INSERT INTO price_quote
        (item_id, external_id, name, name_norm, quality, quality_norm, bonus,
         lot_price, lot_count, current_price, last_trade, lot_updated_at, source_id, fetched_at)
       VALUES (@item_id, @external_id, @name, @name_norm, @quality, @quality_norm, @bonus,
         @lot_price, @lot_count, @current_price, @last_trade, @lot_updated_at, @source_id, @fetched_at)`,
    )
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

export function insertPriceQuotes(db: Db, rows: PriceQuoteInput[]): number {
  const run = db.transaction(() => {
    for (const row of rows) insertPriceQuote(db, row);
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
  return db.prepare(sql).all(...params) as PriceRow[];
}

export function effectivePrice(row: PriceRow | null | undefined): number | null {
  if (!row) return null;
  return row.lot_price ?? row.current_price ?? row.last_trade ?? null;
}

export function bestPrice(db: Db, name: string, quality?: string | null): PriceRow | null {
  return latestPriceRows(db, name, quality)[0] ?? null;
}

export function latestPricesForNames(db: Db, names: string[]): Record<string, PriceRow[]> {
  const out: Record<string, PriceRow[]> = {};
  for (const name of names) out[name] = latestPriceRows(db, name);
  return out;
}

export function countPrices(db: Db): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM price_quote`).get() as { c: number }).c;
}

export function latestPriceFetchedAt(db: Db): string | null {
  const row = db.prepare(`SELECT MAX(fetched_at) AS at FROM price_quote`).get() as { at: string | null };
  return row.at;
}
