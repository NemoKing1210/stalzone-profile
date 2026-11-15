import type { ContainerFillRow, EventRow, ItemRow, OwnedJoined, PriceRow, SourceRow } from '@dossier/core';

type Json = any;

export function parseJson(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function itemJson(item: ItemRow, opts: { raw?: boolean; stats?: unknown[] } = {}): Json {
  return {
    id: item.id,
    exboId: item.exbo_id,
    name: item.name,
    nameEn: item.name_en,
    kind: item.kind,
    category: item.category,
    rank: item.rank,
    slot: item.slot,
    weight: item.weight,
    quality: item.quality,
    cosmetic: !!item.is_cosmetic,
    icon: item.icon_path,
    ...(opts.stats === undefined ? {} : { stats: opts.stats }),
    ...(opts.raw ? { raw: parseJson(item.raw) } : {}),
  };
}

export function ownedJson(row: OwnedJoined): Json {
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.display_name ?? row.item_name,
    exboId: row.exbo_id,
    kind: row.kind,
    category: row.category,
    level: row.level,
    quality: row.quality,
    note: row.note,
    role: row.role,
    slot: row.slot,
    qty: row.qty,
    skinItemId: row.skin_item_id,
    icon: row.item_icon,
    extra: parseJson(row.extra),
    updatedAt: row.updated_at,
  };
}

export function containerFillJson(row: ContainerFillRow): Json {
  return {
    slot: row.slot,
    itemId: row.artifact_item_id,
    name: row.artifact_name ?? null,
    level: row.level,
    quality: row.quality,
    asOf: row.as_of,
    rank: row.artifact_rank ?? null,
    icon: row.artifact_icon ?? null,
  };
}

export function priceJson(row: PriceRow): Json {
  return {
    id: row.id,
    itemId: row.item_id,
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

export function sourceJson(row: SourceRow): Json {
  return {
    id: row.id,
    status: row.status,
    lastOkAt: row.last_ok_at,
    lastTryAt: row.last_try_at,
    lastError: row.last_error,
  };
}

export function eventJson(row: EventRow): Json {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    before: parseJson(row.before),
    after: parseJson(row.after),
    note: row.note,
  };
}
