import type { EventRead } from '@profile/shared/contracts';
import { EventSummarySchema } from '@profile/shared/contracts';
import { parseEventJson, summarizeEvent, type EventRow } from '@profile/core';

/**
 * HTTP adapters over module read DTOs. Everything the routes return is
 * contract-shaped here; raw repository rows never leave the module boundary.
 */
export function eventJson(row: EventRow): EventRead {
  const before = parseEventJson(row.before);
  const after = parseEventJson(row.after);
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    before,
    after,
    note: row.note,
    requestId: row.request_id,
    origin: row.origin,
    summary: storedSummary(row.summary) ?? summarizeEvent(row.action, before, after),
  };
}

/** Rows written before 0009 carry no summary; the stored one is still validated. */
function storedSummary(value: string | null) {
  if (!value) return null;
  const parsed = EventSummarySchema.safeParse(parseEventJson(value));
  return parsed.success ? parsed.data : null;
}
