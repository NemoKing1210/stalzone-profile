import type { ItemEffect, ItemStat, ItemSummary, PriceRow as PriceRowRead } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import * as repo from '../repo/index.js';
import type { ItemRow, SearchOptions } from '../repo/items.js';

/** The HTTP summary of an item: relation fields only, no derived card payload. */
export function itemSummary(
  item: ItemRow,
  icon: string | null,
  extras: { stats?: unknown[]; effects?: unknown[] } = {},
): ItemSummary {
  return {
    id: item.id,
    externalId: item.external_id,
    name: item.name,
    nameEn: item.name_en,
    kind: item.kind,
    category: item.category,
    rank: item.rank,
    slot: item.slot,
    weight: item.weight,
    cosmetic: !!item.is_cosmetic,
    icon,
    baseItemId: item.base_item_id,
    ...(extras.stats === undefined ? {} : { stats: extras.stats }),
    ...(extras.effects === undefined ? {} : { effects: extras.effects }),
  };
}

export function searchItemSummaries(db: Db, opts: SearchOptions = {}): ItemSummary[] {
  const items = repo.searchItems(db, opts);
  const icons = repo.iconsByItemIds(
    db,
    items.map((item) => item.id),
  );
  return items.map((item) => itemSummary(item, icons.get(item.id) ?? null));
}

export function getItemSummary(db: Db, id: number): ItemSummary | null {
  const item = repo.getItemById(db, id);
  if (!item) return null;
  return itemSummary(item, repo.getIcon(db, id)?.path ?? null);
}

export interface ItemDetailRead extends ItemSummary {
  stats: ItemStat[];
  effects: ItemEffect[];
}

export function getItemDetail(db: Db, id: number): ItemDetailRead | null {
  const item = repo.getItemById(db, id);
  if (!item) return null;
  return {
    ...itemSummary(item, repo.getIcon(db, id)?.path ?? null),
    stats: repo.itemStats(db, id),
    effects: repo.listItemEffects(db, id),
  };
}

export function priceRead(row: repo.PriceRow): PriceRowRead {
  return {
    id: row.id,
    itemId: row.item_id,
    externalId: row.external_id,
    name: row.name,
    quality: row.quality,
    bonus: row.bonus,
    lotPrice: row.lot_price,
    lotCount: row.lot_count,
    currentPrice: row.current_price,
    lastTrade: row.last_trade,
    lotUpdatedAt: row.lot_updated_at,
    sourceId: row.source_id,
    fetchedAt: row.fetched_at,
  };
}

export function latestPriceReadsForNames(db: Db, names: string[]): Record<string, PriceRowRead[]> {
  const prices = repo.latestPricesForNames(db, names);
  return Object.fromEntries(Object.entries(prices).map(([name, rows]) => [name, rows.map(priceRead)]));
}
