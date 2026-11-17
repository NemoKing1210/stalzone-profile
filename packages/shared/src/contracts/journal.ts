import { z } from 'zod';

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
  owned: z.object({
    records: z.number().int(),
    copies: z.number().int(),
  }),
});
export type CleanupCounts = z.infer<typeof CleanupCountsSchema>;
