import {
  getOwnedContainer,
  type Db,
  type EventRow,
  type ItemRow,
  type OwnedContainerRow,
  type OwnedJoined,
  type PriceRow,
  type SourceRow,
} from '@dossier/core';

type Json = any;

export function parseJson(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Item relation serializer. The icon lives in its own table, so the caller
 * passes the resolved path from `getIcon`; the item row itself carries no
 * derived raw payload or quality.
 */
export function itemJson(
  item: ItemRow,
  opts: { icon?: string | null; stats?: unknown[]; effects?: unknown[] } = {},
): Json {
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
    icon: opts.icon ?? null,
    ...(opts.stats === undefined ? {} : { stats: opts.stats }),
    ...(opts.effects === undefined ? {} : { effects: opts.effects }),
  };
}

export function ownedJson(db: Db, row: OwnedJoined): Json {
  const container: OwnedContainerRow | null = getOwnedContainer(db, row.id);
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.display_name ?? row.item_name,
    externalId: row.external_id,
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
    container: container
      ? {
          type: container.container_type,
          shield: container.shield,
          bonus: container.bonus,
          protection: container.protection,
          slots: container.slots,
          eff: container.eff,
        }
      : null,
    updatedAt: row.updated_at,
  };
}

export function priceJson(row: PriceRow): Json {
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
