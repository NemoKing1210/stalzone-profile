import { z } from 'zod';

export const SYNC_INTERVAL_MIN = 15;
export const SYNC_INTERVAL_MAX = 10_080;

/** `0` turns the bundle off; any other value must be at least the 15-minute source TTL. */
export const SyncIntervalSchema = z
  .number()
  .int()
  .min(0)
  .max(SYNC_INTERVAL_MAX)
  .refine((value) => value === 0 || value >= SYNC_INTERVAL_MIN, {
    message: `interval must be 0 or between ${SYNC_INTERVAL_MIN} and ${SYNC_INTERVAL_MAX} minutes`,
  });

export const SyncScheduleValuesSchema = z.object({
  enabled: z.boolean(),
  catalogEveryMin: SyncIntervalSchema,
  pricesEveryMin: SyncIntervalSchema,
  profileEveryMin: SyncIntervalSchema,
});

export const SyncScheduleUpdateSchema = SyncScheduleValuesSchema.extend({
  dryRun: z.boolean().default(false),
});

export const SyncScheduleSchema = SyncScheduleValuesSchema.extend({
  updatedAt: z.string(),
});

export const SyncBundleIdSchema = z.enum(['catalog', 'prices', 'profile']);

export const SyncBundleReasonSchema = z.enum([
  'disabled',
  'off',
  'profile_credentials',
  'profile_character',
  'profile_region',
]);

export const SyncBundleStateSchema = z.object({
  id: SyncBundleIdSchema,
  intervalMin: z.number().int(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  ready: z.boolean(),
  reason: SyncBundleReasonSchema.nullable(),
});

export const SourceRecordMetricSchema = z.enum([
  'catalog_items',
  'stat_rows',
  'motif_items',
  'price_quotes',
  'icons',
  'character_stats',
  'inventory_items',
]);
export type SourceRecordMetric = z.infer<typeof SourceRecordMetricSchema>;

export const SourceDiagnosticSchema = z.object({
  id: z.string(),
  kind: z.string(),
  url: z.string().nullable(),
  status: z.enum(['idle', 'ok', 'stale', 'error']),
  lastOkAt: z.string().nullable(),
  lastTryAt: z.string().nullable(),
  lastError: z.string().nullable(),
  commit: z.string().nullable(),
  commitDate: z.string().nullable(),
  records: z.number().int().nullable(),
  /** Names what `records` counts, so a count is never mistaken for bytes. */
  recordMetric: SourceRecordMetricSchema.nullable(),
});

export const SyncDiagnosticsSchema = z.object({
  schedule: SyncScheduleSchema,
  bundles: z.array(SyncBundleStateSchema),
  sources: z.array(SourceDiagnosticSchema),
  catalogItems: z.number().int(),
  profileApiConfigured: z.boolean(),
});

export type SyncScheduleValues = z.infer<typeof SyncScheduleValuesSchema>;
export type SyncScheduleUpdate = z.infer<typeof SyncScheduleUpdateSchema>;
export type SyncSchedule = z.infer<typeof SyncScheduleSchema>;
export type SyncBundleId = z.infer<typeof SyncBundleIdSchema>;
export type SyncBundleReason = z.infer<typeof SyncBundleReasonSchema>;
export type SyncBundleState = z.infer<typeof SyncBundleStateSchema>;
export type SourceDiagnostic = z.infer<typeof SourceDiagnosticSchema>;
export type SyncDiagnostics = z.infer<typeof SyncDiagnosticsSchema>;
