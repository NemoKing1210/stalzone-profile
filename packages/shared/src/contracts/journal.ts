import { z } from 'zod';

/** Coarse shape of an entry, derived from the before/after pair and the action. */
export const EVENT_SUMMARY_KINDS = ['create', 'update', 'delete', 'clear', 'rollback'] as const;

export const EventSummarySchema = z.object({
  kind: z.enum(EVENT_SUMMARY_KINDS),
  /** Top-level fields that differ (or the snapshot keys of a create/delete), capped. */
  fields: z.array(z.string()),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

export const EventReadSchema = z.object({
  id: z.number().int(),
  at: z.string(),
  actor: z.string(),
  action: z.string(),
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  note: z.string().nullable(),
  /** Trace id shared with `log_entry.request_id` and the `x-request-id` response header. */
  requestId: z.string().nullable(),
  /** Client/session origin: `http`, `api`, or null when the writer had no request context. */
  origin: z.string().nullable(),
  summary: EventSummarySchema,
});
export type EventRead = z.infer<typeof EventReadSchema>;

export const WriteDiffSchema = z.object({
  before: z.unknown(),
  after: z.unknown(),
  human: z.string(),
});
export type WriteDiff = z.infer<typeof WriteDiffSchema>;

export const WriteResultSchema = z.object({
  dryRun: z.boolean(),
  diff: WriteDiffSchema,
  eventId: z.number().int().optional(),
});
export type WriteResult = z.infer<typeof WriteResultSchema>;

export const CleanupCountsSchema = z.object({
  inventory: z.object({
    items: z.number().int(),
    storages: z.number().int(),
    placements: z.number().int(),
  }),
  manualStats: z.object({
    records: z.number().int(),
  }),
  character: z.object({
    present: z.boolean(),
    nick: z.string().nullable(),
  }),
  journal: z.object({
    events: z.number().int(),
  }),
});
export type CleanupCounts = z.infer<typeof CleanupCountsSchema>;
