import { z } from 'zod';

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const HealthReadSchema = z.object({
  ok: z.literal(true),
  db: z.literal('ok'),
  time: z.string(),
});
export type HealthRead = z.infer<typeof HealthReadSchema>;

export const SourceStatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  lastOkAt: z.string().nullable(),
  lastTryAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SourcesReadSchema = z.array(SourceStatusSchema);
export type SourcesRead = z.infer<typeof SourcesReadSchema>;

export const SetupStateSchema = z.object({
  needsSetup: z.boolean(),
  catalogItems: z.number().int(),
});
export type SetupState = z.infer<typeof SetupStateSchema>;

export const SetupReadSchema = SetupStateSchema.extend({
  defaultRegion: z.enum(['ru', 'eu', 'na', 'sea']),
  profileApiConfigured: z.boolean(),
  sources: SourcesReadSchema,
});
export type SetupRead = z.infer<typeof SetupReadSchema>;

export const SyncResultSchema = z.object({
  source: z.string(),
  status: z.enum(['ok', 'stale']),
  items: z.number().int(),
  commit: z.string().nullable().optional(),
  fetchedAt: z.string().nullable().optional(),
  error: z.string().optional(),
  ageMin: z.number().optional(),
  cached: z.boolean().optional(),
  icons: z.number().int().optional(),
  failed: z.number().int().optional(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;
