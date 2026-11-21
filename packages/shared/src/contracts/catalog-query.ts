import { z } from 'zod';
import { ItemCardSchema, ItemStatSchema, ItemSummarySchema } from './catalog.js';
import { ItemKindSchema } from './primitives.js';

/**
 * The metrics a catalog row can expose, sort by and filter by. The core registry in
 * `@profile/core` owns their labels, units, direction and derivation; this union is the
 * shared vocabulary between the MCP schema, the query service and the assistant prompt.
 */
export const CATALOG_METRIC_KEYS = [
  'damage',
  'dps',
  'ttk',
  'rof',
  'recoil',
  'spread',
  'hipSpread',
  'mag',
  'reload',
  'reloadTactical',
  'ergonomics',
  'draw',
  'aim',
  'pierce',
  'platePen',
  'weight',
  'armor',
  'protectionBullet',
  'slots',
  'effectiveness',
  'slotEquivalent',
  'protection',
  'caliber',
] as const;

export const CatalogMetricSchema = z.enum(CATALOG_METRIC_KEYS);
export type CatalogMetricKey = z.infer<typeof CatalogMetricSchema>;

/**
 * One bound pair. A filter must set at least one side; the refine keeps the rule at the
 * contract boundary while `z.toJSONSchema` still renders the object properties.
 */
export const CatalogFilterSchema = z
  .object({
    key: z.string().min(1).max(160),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((value) => value.min != null || value.max != null, {
    message: 'A filter needs min or max',
  });
export type CatalogFilter = z.infer<typeof CatalogFilterSchema>;



export const CatalogIncludeSchema = z.enum(['summary', 'metrics', 'full']);

export const CatalogQuerySchema = z.object({
  q: z.string().min(1).nullish(),
  kind: ItemKindSchema.nullish(),
  rank: z.string().nullish(),
  slot: z.string().nullish(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
  level: z.number().int().min(0).max(15).default(15),
  hp: z.number().int().min(1).max(100000).default(600),
  /** A metric key or a stored `stat_id`; `direction` applies to both. */
  sort: z.string().min(1).max(160).optional(),
  direction: z.enum(['asc', 'desc']).default('desc'),
  filters: z.array(CatalogFilterSchema).max(20).optional(),
  include: CatalogIncludeSchema.default('metrics'),
});
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
export type CatalogQueryInput = z.input<typeof CatalogQuerySchema>;

export const CatalogRowSchema = ItemSummarySchema.omit({ stats: true }).extend({
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
  card: ItemCardSchema.optional(),
  stats: z.array(ItemStatSchema).optional(),
});
export type CatalogRow = z.infer<typeof CatalogRowSchema>;

export const CatalogQueryResultSchema = z.object({
  items: z.array(CatalogRowSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type CatalogQueryResult = z.infer<typeof CatalogQueryResultSchema>;

export const CatalogMetricInfoSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string().nullable(),
  direction: z.enum(['higher', 'lower']),
  kinds: z.array(z.string()),
  leveled: z.boolean(),
});
export type CatalogMetricInfo = z.infer<typeof CatalogMetricInfoSchema>;

export const CatalogStatInfoSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  category: z.string().nullable(),
  valueType: z.string().nullable(),
  pct: z.boolean(),
  positive: z.boolean().nullable(),
  kinds: z.array(z.string()),
  count: z.number().int().nonnegative(),
});
export type CatalogStatInfo = z.infer<typeof CatalogStatInfoSchema>;

export const CatalogDescriptionSchema = z.object({
  kinds: z.array(z.object({ kind: z.string(), count: z.number().int().nonnegative() })),
  metrics: z.array(CatalogMetricInfoSchema),
  stats: z.array(CatalogStatInfoSchema),
  meta: z.object({
    updated: z.string().nullable(),
    source: z.string(),
    items: z.number().int().nonnegative(),
  }),
  freshness: z.unknown(),
});
export type CatalogDescription = z.infer<typeof CatalogDescriptionSchema>;

export const GetItemOptionsSchema = z.object({
  levels: z.array(z.number().int().min(0).max(15)).min(1).max(17).default([0, 15]),
  with_modifications: z.boolean().default(false),
});
export type GetItemOptions = z.infer<typeof GetItemOptionsSchema>;

export const CompareItemsQuerySchema = z
  .object({
    items: z.array(z.string().min(1)).min(2).max(10).optional(),
    a: z.string().min(1).optional(),
    b: z.string().min(1).optional(),
    kind: ItemKindSchema.optional(),
    level: z.number().int().min(0).max(15).default(15),
    hp: z.number().int().min(1).max(100000).default(600),
  })
  .refine((value) => value.items != null || (value.a != null && value.b != null), {
    message: 'Provide items or a and b',
  });
export type CompareItemsQuery = z.infer<typeof CompareItemsQuerySchema>;
