import type { EventRead } from '@profile/shared/contracts';
import { parseEventJson, type EventRow } from '@profile/core';

/**
 * HTTP adapters over module read DTOs. Everything the routes return is
 * contract-shaped here; raw repository rows never leave the module boundary.
 */
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
