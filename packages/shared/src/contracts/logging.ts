import { z } from 'zod';

/* ------------------------------- primitives ------------------------------- */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const LOG_CATEGORIES = ['http', 'sync', 'mcp', 'db', 'app', 'client'] as const;
export const LOG_SOURCES = ['server', 'mcp', 'cli', 'client'] as const;

export const LogLevelSchema = z.enum(LOG_LEVELS);
export const LogLevelOrOffSchema = z.enum([...LOG_LEVELS, 'off']);
export const LogCategorySchema = z.enum(LOG_CATEGORIES);
export const LogSourceSchema = z.enum(LOG_SOURCES);

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type LogLevelOrOff = z.infer<typeof LogLevelOrOffSchema>;
export type LogCategory = z.infer<typeof LogCategorySchema>;
export type LogSource = z.infer<typeof LogSourceSchema>;

/** Audit actions that cannot be rolled back; the journal UI hides the action. */
export const NON_ROLLBACKABLE_ACTIONS = ['rollback', 'log.clear'] as const;

const ISO = z.string().datetime();

/* --------------------------------- entries -------------------------------- */

export const LogEntrySchema = z.object({
  id: z.number().int(),
  at: ISO,
  level: LogLevelSchema,
  category: LogCategorySchema,
  source: LogSourceSchema,
  message: z.string(),
  context: z.unknown(),
  stack: z.string().nullable(),
  requestId: z.string().nullable(),
  fingerprint: z.string(),
  durationMs: z.number().int().nullable(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogGroupSchema = z.object({
  fingerprint: z.string(),
  level: LogLevelSchema,
  category: LogCategorySchema,
  count: z.number().int(),
  firstAt: ISO,
  lastAt: ISO,
  sample: z.string(),
});
export type LogGroup = z.infer<typeof LogGroupSchema>;

/* --------------------------------- queries -------------------------------- */

export const LogQuerySchema = z.object({
  levels: z.array(LogLevelSchema).optional(),
  categories: z.array(LogCategorySchema).optional(),
  sources: z.array(LogSourceSchema).optional(),
  since: ISO.optional(),
  until: ISO.optional(),
  text: z.string().min(1).max(200).optional(),
  requestId: z.string().min(1).max(200).optional(),
  fingerprint: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  minDurationMs: z.number().int().min(0).optional(),
  before: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type LogQuery = z.input<typeof LogQuerySchema>;
export type LogQueryParsed = z.output<typeof LogQuerySchema>;

/** Route-shaped query: comma-separated lists and string numbers. */
function csv<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess((value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value), z.array(item).optional());
}

export const LogQueryParamsSchema = z.object({
  levels: csv(LogLevelSchema),
  categories: csv(LogCategorySchema),
  sources: csv(LogSourceSchema),
  since: ISO.optional(),
  until: ISO.optional(),
  text: z.string().min(1).max(200).optional(),
  requestId: z.string().min(1).max(200).optional(),
  fingerprint: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  minDurationMs: z.coerce.number().int().min(0).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const LogQueryResultSchema = z.object({
  entries: z.array(LogEntrySchema),
  groups: z.array(LogGroupSchema),
  nextBefore: z.number().int().nullable(),
  hasMore: z.boolean(),
});
export type LogQueryResult = z.infer<typeof LogQueryResultSchema>;

/* --------------------------------- settings ------------------------------- */

const LoggingScalarsSchema = z.object({
  enabled: z.boolean(),
  minLevel: LogLevelSchema,
  retentionDays: z.number().int().min(1).max(365),
  maxRows: z.number().int().min(1000).max(2_000_000),
  captureClient: z.boolean(),
  clientConsole: z.boolean(),
  mirrorStdout: z.boolean(),
});

const LogLevelsMapSchema = z.object({
  http: LogLevelOrOffSchema,
  sync: LogLevelOrOffSchema,
  mcp: LogLevelOrOffSchema,
  db: LogLevelOrOffSchema,
  app: LogLevelOrOffSchema,
  client: LogLevelOrOffSchema,
});

const LogOverridesSchema = z.object({
  http: LogLevelOrOffSchema.optional(),
  sync: LogLevelOrOffSchema.optional(),
  mcp: LogLevelOrOffSchema.optional(),
  db: LogLevelOrOffSchema.optional(),
  app: LogLevelOrOffSchema.optional(),
  client: LogLevelOrOffSchema.optional(),
});

export const LoggingSettingsSchema = LoggingScalarsSchema.extend({
  levels: LogLevelsMapSchema,
  overrides: LogOverridesSchema,
  updatedAt: z.string(),
});
export type LoggingSettings = z.infer<typeof LoggingSettingsSchema>;

const LogLevelsUpdateSchema = z.object({
  http: z.union([LogLevelOrOffSchema, z.literal('inherit')]),
  sync: z.union([LogLevelOrOffSchema, z.literal('inherit')]),
  mcp: z.union([LogLevelOrOffSchema, z.literal('inherit')]),
  db: z.union([LogLevelOrOffSchema, z.literal('inherit')]),
  app: z.union([LogLevelOrOffSchema, z.literal('inherit')]),
  client: z.union([LogLevelOrOffSchema, z.literal('inherit')]),
});

export const LoggingSettingsUpdateSchema = LoggingScalarsSchema.extend({
  levels: LogLevelsUpdateSchema,
  dryRun: z.boolean().default(false),
});
export type LoggingSettingsUpdate = z.input<typeof LoggingSettingsUpdateSchema>;
export type LoggingSettingsUpdateValues = z.output<typeof LoggingSettingsUpdateSchema>;

export const LogStatsSchema = z.object({
  windowHours: z.number().int(),
  byLevel: z.record(LogLevelSchema, z.number().int()),
  byCategory: z.record(LogCategorySchema, z.number().int()),
  bySource: z.record(LogSourceSchema, z.number().int()),
  oldestAt: ISO.nullable(),
  newestAt: ISO.nullable(),
  bytes: z.number().int(),
  queue: z.object({ queued: z.number().int(), dropped: z.number().int() }),
  settings: LoggingSettingsSchema,
});
export type LogStats = z.infer<typeof LogStatsSchema>;

export const ClientLogConfigSchema = z.object({
  enabled: z.boolean(),
  captureClient: z.boolean(),
  clientConsole: z.boolean(),
  levels: LogLevelsMapSchema,
});
export type ClientLogConfig = z.infer<typeof ClientLogConfigSchema>;

/* -------------------------------- client logs ----------------------------- */

export const ClientLogEntrySchema = z.object({
  level: LogLevelSchema,
  message: z.string().min(1).max(4096),
  context: z.unknown().optional(),
  stack: z.string().max(8192).nullish(),
  at: ISO.optional(),
  requestId: z.string().max(200).nullish(),
});
export type ClientLogEntry = z.infer<typeof ClientLogEntrySchema>;

/** Raw browser payload budget, measured as UTF-8 JSON bytes. */
export const CLIENT_LOG_BATCH_MAX_BYTES = 32 * 1024;

/**
 * The request envelope only. Entries stay unknown here so the ingest service
 * can validate them one by one: one malformed entry must not reject its
 * valid neighbours.
 */
export const ClientLogBatchSchema = z.object({
  entries: z.array(z.unknown()).min(1).max(50),
});
export type ClientLogBatch = z.infer<typeof ClientLogBatchSchema>;

/* ---------------------------------- purge --------------------------------- */

export const LogPurgeFilterSchema = LogQuerySchema.omit({ before: true, limit: true });
export type LogPurgeFilter = z.infer<typeof LogPurgeFilterSchema>;

export const PurgeLogsSchema = z.object({
  scope: z.enum(['all', 'filtered']),
  filter: LogPurgeFilterSchema.optional(),
  dryRun: z.boolean().default(false),
});
export type PurgeLogsInput = z.input<typeof PurgeLogsSchema>;
export type PurgeLogsValues = z.output<typeof PurgeLogsSchema>;
