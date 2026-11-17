import { z } from 'zod';
import { SourcesReadSchema } from './api.js';
import { ItemCardSchema, ItemEffectSchema, ItemStatSchema, ItemSummarySchema } from './catalog.js';
import {
  ContainerReadSchema,
  InventoryItemReadSchema,
  InventoryReadSchema,
  StorageReadSchema,
} from './inventory.js';
import { ProfileExportSchema, PayloadCharacterSchema, PayloadMetaSchema } from './payload.js';
import { LoggingSettingsSchema, LogQueryResultSchema, LogStatsSchema } from './logging.js';

/** The MCP price row omits the database ids that the HTTP route includes. */
export const McpPriceRowSchema = z.object({
  name: z.string(),
  quality: z.string().nullable(),
  bonus: z.number().nullable(),
  lotPrice: z.number().nullable(),
  lotCount: z.number().nullable(),
  currentPrice: z.number().nullable(),
  lastTrade: z.number().nullable(),
  lotUpdatedAt: z.string().nullable(),
  sourceId: z.string(),
  fetchedAt: z.string(),
});
export type McpPriceRow = z.infer<typeof McpPriceRowSchema>;

export const McpItemSchema = ItemSummarySchema.extend({
  stats: z.array(ItemStatSchema),
  effects: z.array(ItemEffectSchema),
  card: ItemCardSchema,
});
export type McpItem = z.infer<typeof McpItemSchema>;

export const PlanResultSchema = z
  .object({
    picked: z.array(z.record(z.string(), z.unknown())),
  })
  .loose();
export type PlanResult = z.infer<typeof PlanResultSchema>;

export const READ_OUTPUT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  get_character: z.object({
    character: PayloadCharacterSchema.nullable(),
    meta: PayloadMetaSchema,
  }),
  find_items: z.object({ items: z.array(ItemSummarySchema) }),
  get_item: z.object({ item: McpItemSchema }),
  compare_items: z.object({ items: z.array(z.object({ found: z.boolean() }).loose()) }),
  get_inventory: InventoryReadSchema,
  list_storages: z.object({ storages: z.array(StorageReadSchema) }),
  list_inventory_items: z.object({ items: z.array(InventoryItemReadSchema) }),
  list_containers: z.object({ items: z.array(ContainerReadSchema) }),
  plan_artifact_build: z.object({ plan: PlanResultSchema }),
  get_prices: z.object({ prices: z.record(z.string(), z.array(McpPriceRowSchema)) }),
  sources_status: z.object({ sources: SourcesReadSchema }),
  export_profile_json: z.object({ profile: ProfileExportSchema }),
  list_logs: LogQueryResultSchema,
  log_stats: LogStatsSchema,
  get_logging: LoggingSettingsSchema,
};
