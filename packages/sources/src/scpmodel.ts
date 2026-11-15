import type { FetchLike } from './exbo.js';

type Json = Record<string, any>;

export const PRICES_URL = 'https://scpmodel.ru/api/predictions';
export const PRICE_TTL_MIN = 15;

export interface PriceRow {
  itemKey: string | null;
  exboId: string | null;
  name: string;
  quality: string | null;
  qualityIndex: string | null;
  bonus: number | null;
  isArtifact: boolean;
  currentPrice: number | null;
  lotPrice: number | null;
  lotCount: number | null;
  lastTrade: number | null;
  lotUpdatedAt: string | null;
}

export interface PricesFetchOptions {
  region?: string;
  fetchImpl?: FetchLike;
}

export interface PricesSnapshot {
  region: string;
  fetchedAt: string;
  rows: PriceRow[];
}

/** Auction analytics (minimum lot, lot count, last trade) for one realm. */
export const scpmodelAdapter = {
  async fetch(options: PricesFetchOptions = {}): Promise<PricesSnapshot> {
    const region = options.region ?? 'ru';
    const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    const url = `${PRICES_URL}?region=${encodeURIComponent(region)}`;
    const response = await fetchImpl(url);
    if (response.status !== 200) throw new Error(`scpmodel HTTP ${response.status}: ${url}`);
    const body = (await response.json()) as Json[];
    if (!Array.isArray(body)) throw new Error('scpmodel returned a non-array body');
    return {
      region,
      fetchedAt: new Date().toISOString(),
      rows: body.map((row) => ({
        itemKey: row.item_key ?? null,
        exboId: row.item_id != null ? String(row.item_id) : null,
        name: String(row.name ?? ''),
        quality: row.qlt_label ?? null,
        qualityIndex: row._qlt ?? null,
        bonus: typeof row._bonus === 'number' ? row._bonus : null,
        isArtifact: !!row.is_artifact,
        currentPrice: row.current_price ?? null,
        lotPrice: row.min_lot ?? null,
        lotCount: row.lot_count ?? null,
        lastTrade: row.last_trade_price ?? null,
        lotUpdatedAt: row.lot_updated_at ?? row.updated_at ?? null,
      })),
    };
  },
};
