import type { EventRead, ItemSummary } from '@dossier/shared/contracts';
import { itemSummary, type ItemRow, parseEventJson, type EventRow } from '@dossier/core';

/**
 * HTTP adapters over module read DTOs. Everything the routes return is
 * contract-shaped here; raw repository rows never leave the module boundary.
 */
export function itemJson(
  item: ItemRow,
  opts: { icon?: string | null; stats?: unknown[]; effects?: unknown[] } = {},
): ItemSummary {
  return itemSummary(item, opts.icon ?? null, { stats: opts.stats, effects: opts.effects });
}

export function eventJson(row: EventRow): EventRead {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    before: parseEventJson(row.before),
    after: parseEventJson(row.after),
    note: row.note,
  };
}
