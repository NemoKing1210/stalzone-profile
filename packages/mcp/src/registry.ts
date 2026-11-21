import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ItemKindSchema } from '@profile/shared';
import {
  AddInventoryItemInputSchema,
  LOG_CATEGORIES,
  LOG_LEVELS,
  LOG_SOURCES,
  AutoArrangeStorageInputSchema,
  CompareItemsInputSchema,
  CreateStorageInputSchema,
  DeleteStorageInputSchema,
  FindItemsQuerySchema,
  MoveInventoryItemInputSchema,
  PlanArtifactBuildInputSchema,
  RemoveInventoryItemInputSchema,
  SetContainerArtifactsInputSchema,
  SetItemLayoutInputSchema,
  SetWeaponModificationInputSchema,
  UpdateInventoryItemInputSchema,
  UpdateStorageInputSchema,
  type AddInventoryItemInput,
  type ContainerDataWrite,
  type InventoryItemPatch,
  type McpContainerDataInput,
  type McpPlacementTarget,
  type PlacementTarget,
  type StoragePatch,
  type UpdateInventoryItemInput,
  type UpdateStorageInput,
} from '@profile/shared/contracts';
import type { Logger } from '@profile/core';
import { McpClientError, type ProfileClient } from './client.js';
import { instrumentClient } from './logging.js';

type Json = Record<string, unknown>;

export interface WriteLimiter {
  take(now?: number): boolean;
}

/** Fixed-window write limiter; shared by every transport that serves the same client. */
export function writeLimiter(maxPerMinute = 30): WriteLimiter {
  let windowStart = 0;
  let count = 0;
  return {
    take(now = Date.now()) {
      if (now - windowStart >= 60_000) {
        windowStart = now;
        count = 0;
      }
      if (count >= maxPerMinute) return false;
      count += 1;
      return true;
    },
  };
}

const GetItemInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().min(1).optional(),
    kind: ItemKindSchema.optional(),
  })
  .refine((value) => value.id != null || value.name != null, {
    message: 'Provide id or name',
  });

const GetPricesInputSchema = z.object({
  names: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(100)]),
  quality: z.string().nullish(),
});

const SyncSourceInputSchema = z.object({
  source: z.enum(['exbo', 'exbo_base', 'wiki', 'motifs', 'scpmodel', 'icons', 'profile']),
  force: z.boolean().default(false),
  confirm: z.boolean().default(false),
});

const ListLogsInputSchema = z.object({
  levels: z.array(z.enum(LOG_LEVELS)).optional(),
  categories: z.array(z.enum(LOG_CATEGORIES)).optional(),
  sources: z.array(z.enum(LOG_SOURCES)).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  text: z.string().min(1).max(200).optional(),
  request_id: z.string().min(1).max(200).optional(),
  fingerprint: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  min_duration_ms: z.number().int().min(0).optional(),
  before: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

const LogStatsInputSchema = z.object({
  window_hours: z.number().int().min(1).max(720).default(24),
});

const LogLevelSettingSchema = z.enum([...LOG_LEVELS, 'off', 'inherit']);

const UpdateLoggingInputSchema = z.object({
  enabled: z.boolean(),
  min_level: z.enum(LOG_LEVELS),
  retention_days: z.number().int().min(1).max(365),
  max_rows: z.number().int().min(1_000).max(2_000_000),
  capture_client: z.boolean(),
  client_console: z.boolean(),
  mirror_stdout: z.boolean(),
  levels: z.object({
    http: LogLevelSettingSchema,
    sync: LogLevelSettingSchema,
    mcp: LogLevelSettingSchema,
    db: LogLevelSettingSchema,
    app: LogLevelSettingSchema,
    client: LogLevelSettingSchema,
  }),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

const PurgeFilterInputSchema = z.object({
  levels: z.array(z.enum(LOG_LEVELS)).optional(),
  categories: z.array(z.enum(LOG_CATEGORIES)).optional(),
  sources: z.array(z.enum(LOG_SOURCES)).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  text: z.string().min(1).max(200).optional(),
  request_id: z.string().min(1).max(200).optional(),
  fingerprint: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  min_duration_ms: z.number().int().min(0).optional(),
});

const ClearLogsInputSchema = z.object({
  scope: z.enum(['all', 'filtered']),
  filter: PurgeFilterInputSchema.optional(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

const RollbackInputSchema = z.object({
  event_id: z.number().int().positive(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

const ListInventoryItemsInputSchema = z.object({
  kind: ItemKindSchema.optional(),
  location: z.enum(['grid', 'equipment', 'container', 'weapon_modification', 'loose']).optional(),
  storage_id: z.number().int().positive().optional(),
  virtual: z.boolean().optional(),
});

/**
 * The one input schema per tool. The registry validates with it and the assistant receives
 * the same shape as provider JSON Schema — a tool without `properties` gives the model no
 * way to know its arguments and it calls the tool with `{}`.
 */
const TOOL_SCHEMAS = {
  get_character: z.object({}),
  find_items: FindItemsQuerySchema,
  get_item: GetItemInputSchema,
  compare_items: CompareItemsInputSchema,
  get_inventory: z.object({}),
  list_storages: z.object({}),
  list_inventory_items: ListInventoryItemsInputSchema,
  list_containers: z.object({}),
  plan_artifact_build: PlanArtifactBuildInputSchema,
  get_prices: GetPricesInputSchema,
  sources_status: z.object({}),
  export_profile_json: z.object({}),
  add_inventory_item: AddInventoryItemInputSchema,
  update_inventory_item: UpdateInventoryItemInputSchema,
  remove_inventory_item: RemoveInventoryItemInputSchema,
  move_inventory_item: MoveInventoryItemInputSchema,
  create_storage: CreateStorageInputSchema,
  update_storage: UpdateStorageInputSchema,
  delete_storage: DeleteStorageInputSchema,
  set_container_artifacts: SetContainerArtifactsInputSchema,
  set_weapon_modification: SetWeaponModificationInputSchema,
  set_item_layout: SetItemLayoutInputSchema,
  auto_arrange_storage: AutoArrangeStorageInputSchema,
  sync_source: SyncSourceInputSchema,
  rebuild_site: z.object({}),
  rollback_event: RollbackInputSchema,
  list_logs: ListLogsInputSchema,
  log_stats: LogStatsInputSchema,
  get_logging: z.object({}),
  update_logging: UpdateLoggingInputSchema,
  clear_logs: ClearLogsInputSchema,
} as const;

/** Read-only tools with sample arguments; used by the stdio smoke and integration tests. */
export const READ_TOOLS: { name: string; args: Record<string, unknown> }[] = [
  { name: 'get_character', args: {} },
  { name: 'find_items', args: { q: 'АК', limit: 3 } },
  { name: 'get_item', args: { name: 'АК-12' } },
  { name: 'compare_items', args: { a: 'АК-12', b: 'KS-1', level: 15 } },
  { name: 'get_inventory', args: {} },
  { name: 'list_storages', args: {} },
  { name: 'list_inventory_items', args: {} },
  { name: 'list_containers', args: {} },
  { name: 'plan_artifact_build', args: { preset: 'speed', slots: 3 } },
  { name: 'get_prices', args: { names: ['АК-12'] } },
  { name: 'sources_status', args: {} },
  { name: 'export_profile_json', args: {} },
  { name: 'list_logs', args: { limit: 5 } },
  { name: 'log_stats', args: { window_hours: 24 } },
  { name: 'get_logging', args: {} },
];

/** Loose zod shape of every read tool result, so the smoke fails loudly on malformed output. */
export { READ_OUTPUT_SCHEMAS } from '@profile/shared/contracts';

const TOOL_DOCS: Record<string, string> = {
    get_character: 'Character profile and stats from the profile',
    find_items: 'Search catalog items by name, kind, rank and slot',
    get_item: 'Item card: typed stats, effects, icon and the derived detail card',
    compare_items: 'Compare two weapons by DPS and TTK at a refinement level',
    get_inventory: 'Storages, equipment, the intake stash and the computed loadout',
    list_storages: 'Storages with grid items, weight and effective height, including intake',
    list_inventory_items: 'Inventory instances filtered by kind, location or storage',
    list_containers: 'Containers with their current fill',
    plan_artifact_build: 'Pick artifacts for an effect preset, slots and budget',
    get_prices: 'Latest auction prices by item name',
    sources_status: 'Data source state and freshness',
    export_profile_json: 'Export the profile as portable JSON',
    add_inventory_item: 'Add an item instance to intake; virtual marks it as not owned in game (dry_run by default)',
    update_inventory_item:
      'Change an instance level, quality, rarity, skin, quantity or virtual mark (dry_run by default)',
    remove_inventory_item: 'Remove an instance or part of a stack (dry_run by default)',
    move_inventory_item:
      'Move an instance to a grid cell, slot, container or module; intake only releases items (dry_run by default)',
    create_storage: 'Create a stash storage (dry_run by default)',
    update_storage: 'Rename, resize or reorder a stash (dry_run by default)',
    delete_storage: 'Delete a stash; its items move to the intake stash (dry_run by default)',
    set_container_artifacts: 'Replace a container fill by instance ids (dry_run by default)',
    set_weapon_modification: 'Install or remove a weapon modification (dry_run by default)',
    set_item_layout: 'Change a catalog item grid size or weight (dry_run by default)',
    auto_arrange_storage: 'Pack intake items into a stash by first fit (dry_run by default)',
    sync_source: 'Run a source sync (exbo_base, wiki, motifs, scpmodel, icons, profile); requires confirm',
    rebuild_site: 'Site rebuild happens on deploy; MCP only reports the command',
    rollback_event: 'Roll back a journal event (dry_run by default)',
    list_logs: 'Diagnostic log entries with filters and repeat groups',
    log_stats: 'Log counts by level, category and source, plus storage size',
    get_logging: 'Logging settings and effective per-category levels',
    update_logging: 'Change logging settings (dry_run by default)',
    clear_logs: 'Delete logs by filter or entirely (dry_run by default)',
};

/** Tools that change profile data; the assistant pauses for confirmation on each. */
export const WRITE_TOOL_NAMES = [
  'add_inventory_item',
  'update_inventory_item',
  'remove_inventory_item',
  'move_inventory_item',
  'create_storage',
  'update_storage',
  'delete_storage',
  'set_container_artifacts',
  'set_weapon_modification',
  'set_item_layout',
  'auto_arrange_storage',
  'sync_source',
  'rebuild_site',
  'rollback_event',
  'update_logging',
  'clear_logs',
] as const;

const WRITE_TOOL_SET = new Set<string>(WRITE_TOOL_NAMES);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_SET.has(name);
}

/** Provider-facing function definitions: the registry still validates every argument. */
export function toolDefinitions(allowList?: readonly string[]): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}[] {
  const allowed = allowList && allowList.length ? new Set(allowList) : null;
  return Object.entries(TOOL_DOCS)
    .filter(([name]) => (allowed ? allowed.has(name) || isWriteTool(name) : true))
    .map(([name, description]) => ({
      name,
      description,
      parameters: toolJsonSchema(name),
    }));
}

/** The actual argument shape, so the model can call `find_items({ q, kind, limit })`. */
function toolJsonSchema(name: string): Record<string, unknown> {
  const schema = (TOOL_SCHEMAS as Record<string, z.ZodTypeAny>)[name];
  if (!schema) return { type: 'object', properties: {}, additionalProperties: true };
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data as Json,
  };
}

function fail(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: { code, message } }) }],
  };
}

function errorResult(error: unknown) {
  if (error instanceof McpClientError) return fail(error.code, error.message);
  const message = error instanceof Error ? error.message : String(error);
  return fail('INTERNAL', message);
}

function confirmation(dryRun: boolean, confirm: boolean) {
  if (dryRun) return null;
  if (!confirm) {
    return fail('CONFIRM_REQUIRED', 'To write, pass dry_run: false and confirm: true');
  }
  return null;
}

function placementTarget(target: McpPlacementTarget): PlacementTarget {
  switch (target.location) {
    case 'grid':
      return {
        location: 'grid',
        storageId: target.storage_id,
        x: target.x,
        y: target.y,
      };
    case 'equipment':
      return { location: 'equipment', slot: target.slot };
    case 'container':
      return { location: 'container', containerItemId: target.container_item_id, slot: target.slot };
    case 'weapon_modification':
      return {
        location: 'weapon_modification',
        weaponItemId: target.weapon_item_id,
        slot: target.slot,
        allowUnverified: target.allow_unverified,
      };
  }
}

function containerData(input: McpContainerDataInput | null | undefined): ContainerDataWrite | null | undefined {
  if (input === null) return null;
  if (input === undefined) return undefined;
  return {
    type: input.type ?? null,
    shield: input.shield ?? null,
    bonus: input.bonus ?? null,
    protection: input.protection ?? null,
    slots: input.slots ?? null,
    eff: input.eff ?? null,
  };
}

function itemPatch(args: UpdateInventoryItemInput, dryRun: boolean): InventoryItemPatch {
  const patch: InventoryItemPatch = { dryRun };
  if (args.level !== undefined) patch.level = args.level;
  if (args.skin !== undefined) patch.skin = args.skin;
  if (args.quality !== undefined) patch.quality = args.quality;
  if (args.rarity_pct !== undefined) patch.rarityPct = args.rarity_pct;
  if (args.rarity_tier !== undefined) patch.rarityTier = args.rarity_tier;
  if (args.qty !== undefined) patch.qty = args.qty;
  if (args.virtual !== undefined) patch.virtual = args.virtual;
  if (args.display_name !== undefined) patch.displayName = args.display_name;
  if (args.container !== undefined) patch.container = containerData(args.container);
  return patch;
}

function storagePatch(args: UpdateStorageInput, dryRun: boolean): StoragePatch {
  const patch: StoragePatch = { dryRun };
  if (args.name !== undefined) patch.name = args.name;
  if (args.max_weight !== undefined) patch.maxWeight = args.max_weight;
  if (args.sort_order !== undefined) patch.sortOrder = args.sort_order;
  return patch;
}

/** Registers a write tool with the shared dry_run/confirm and rate-limit gates. */
function registerWriteTool(
  server: McpServer,
  limiter: WriteLimiter,
  name: string,
  inputSchema: z.ZodTypeAny,
  handler: (args: Record<string, unknown>, dryRun: boolean) => Promise<unknown>,
): void {
  server.registerTool(name, { description: TOOL_DOCS[name], inputSchema }, async (raw) => {
    const args = raw as Record<string, unknown> & { dry_run: boolean; confirm: boolean };
    const dryRun = args.dry_run;
    const gate = confirmation(dryRun, args.confirm);
    if (gate) return gate;
    if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
    try {
      return ok(await handler(args, dryRun));
    } catch (error) {
      return errorResult(error);
    }
  });
}

export interface ProfileServerOptions {
  writesPerMinute?: number;
  limiter?: WriteLimiter;
  logger?: Logger;
  /** Shared by every tool call of one request; defaults to a fresh id per call. */
  requestId?: string | null;
  /** Tells the built-in chat from an external agent in `log_entry.context`. */
  channel?: 'chat' | 'mcp' | 'stdio';
}

/** The single tool registry behind stdio and `/mcp`; transports only carry messages. */
export function createProfileServer(
  profileClient: ProfileClient,
  options: ProfileServerOptions = {},
): McpServer {
  const client = options.logger
    ? instrumentClient(profileClient, options.logger, {
        requestId: options.requestId,
        channel: options.channel,
      })
    : profileClient;
  const server = new McpServer(
    { name: 'stalzone-profile', version: '0.1.0' },
    { instructions: 'Personal STALZONE profile. Reads are open; writes default to dry_run and require confirm.' },
  );
  const limiter = options.limiter ?? writeLimiter(options.writesPerMinute ?? 30);

  server.registerTool(
    'get_character',
    { description: TOOL_DOCS.get_character, inputSchema: TOOL_SCHEMAS.get_character },
    async () => {
      try {
        return ok(await client.getCharacter());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'find_items',
    { description: TOOL_DOCS.find_items, inputSchema: TOOL_SCHEMAS.find_items },
    async (args) => {
      try {
        return ok({ items: await client.findItems(args) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_item',
    { description: TOOL_DOCS.get_item, inputSchema: TOOL_SCHEMAS.get_item },
    async (args) => {
      try {
        const item = await client.getItem(args);
        if (!item) return fail('ITEM_NOT_FOUND', 'Item not found');
        return ok({ item });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'compare_items',
    { description: TOOL_DOCS.compare_items, inputSchema: TOOL_SCHEMAS.compare_items },
    async (args) => {
      try {
        return ok({ items: await client.compareItems(args.a ?? '', args.b ?? '', args.level) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_inventory',
    { description: TOOL_DOCS.get_inventory, inputSchema: TOOL_SCHEMAS.get_inventory },
    async () => {
      try {
        return ok(await client.getInventory());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_storages',
    { description: TOOL_DOCS.list_storages, inputSchema: TOOL_SCHEMAS.list_storages },
    async () => {
      try {
        return ok({ storages: await client.listStorages() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_inventory_items',
    {
      description: TOOL_DOCS.list_inventory_items,
      inputSchema: TOOL_SCHEMAS.list_inventory_items,
    },
    async (args) => {
      try {
        return ok({
          items: await client.listInventoryItems({
            kind: args.kind,
            location: args.location,
            storageId: args.storage_id,
            virtual: args.virtual,
          }),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_containers',
    { description: TOOL_DOCS.list_containers, inputSchema: TOOL_SCHEMAS.list_containers },
    async () => {
      try {
        return ok({ items: await client.listContainers() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'plan_artifact_build',
    { description: TOOL_DOCS.plan_artifact_build, inputSchema: TOOL_SCHEMAS.plan_artifact_build },
    async (args) => {
      try {
        return ok({ plan: await client.planArtifactBuild(args as unknown as Parameters<ProfileClient['planArtifactBuild']>[0]) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_prices',
    { description: TOOL_DOCS.get_prices, inputSchema: TOOL_SCHEMAS.get_prices },
    async (args) => {
      try {
        const names = Array.isArray(args.names) ? args.names : [args.names];
        return ok({ prices: await client.getPrices(names, args.quality ?? null) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'sources_status',
    { description: TOOL_DOCS.sources_status, inputSchema: TOOL_SCHEMAS.sources_status },
    async () => {
      try {
        return ok({ sources: await client.sourcesStatus() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'export_profile_json',
    { description: TOOL_DOCS.export_profile_json, inputSchema: TOOL_SCHEMAS.export_profile_json },
    async () => {
      try {
        return ok({ profile: await client.exportProfileJson() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_logs',
    { description: TOOL_DOCS.list_logs, inputSchema: TOOL_SCHEMAS.list_logs },
    async (args) => {
      try {
        return ok(
          await client.listLogs({
            levels: args.levels,
            categories: args.categories,
            sources: args.sources,
            since: args.since,
            until: args.until,
            text: args.text,
            requestId: args.request_id,
            fingerprint: args.fingerprint,
            minDurationMs: args.min_duration_ms,
            before: args.before,
            limit: args.limit,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'log_stats',
    { description: TOOL_DOCS.log_stats, inputSchema: TOOL_SCHEMAS.log_stats },
    async (args) => {
      try {
        return ok(await client.logStats(args.window_hours));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_logging',
    { description: TOOL_DOCS.get_logging, inputSchema: TOOL_SCHEMAS.get_logging },
    async () => {
      try {
        return ok(await client.getLogging());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerWriteTool(
    server,
    limiter,
    'add_inventory_item',
    TOOL_SCHEMAS.add_inventory_item,
    async (raw, dryRun) => {
      const args = raw as unknown as AddInventoryItemInput;
      return client.addInventoryItem({
        name: args.name,
        kind: args.kind,
        catalogItemId: args.catalog_item_id,
        level: args.level,
        skin: args.skin ?? null,
        quality: args.quality ?? null,
        rarityPct: args.rarity_pct ?? null,
        rarityTier: args.rarity_tier ?? null,
        qty: args.qty,
        virtual: args.virtual,
        displayName: args.display_name ?? null,
        container: containerData(args.container) ?? undefined,
        dryRun,
      });
    },
  );

  registerWriteTool(
    server,
    limiter,
    'update_inventory_item',
    TOOL_SCHEMAS.update_inventory_item,
    async (raw, dryRun) => {
      const args = raw as unknown as UpdateInventoryItemInput;
      return client.updateInventoryItem(args.item_id, itemPatch(args, dryRun));
    },
  );

  registerWriteTool(
    server,
    limiter,
    'remove_inventory_item',
    TOOL_SCHEMAS.remove_inventory_item,
    async (raw, dryRun) => {
      const args = raw as unknown as { item_id: number; qty?: number };
      return client.removeInventoryItem(args.item_id, { qty: args.qty, dryRun });
    },
  );

  registerWriteTool(
    server,
    limiter,
    'move_inventory_item',
    TOOL_SCHEMAS.move_inventory_item,
    async (raw, dryRun) => {
      const args = raw as unknown as {
        item_id: number;
        target: McpPlacementTarget;
        swap: boolean;
        allow_unverified: boolean;
      };
      return client.moveInventoryItem(args.item_id, {
        target: placementTarget(args.target),
        swap: args.swap,
        allowUnverified: args.allow_unverified,
        dryRun,
      });
    },
  );

  registerWriteTool(server, limiter, 'create_storage', TOOL_SCHEMAS.create_storage, async (raw, dryRun) => {
    const args = raw as unknown as {
      kind: 'inventory' | 'stash';
      name: string;
      max_weight?: number | null;
      sort_order?: number;
    };
    return client.createStorage({
      kind: args.kind,
      name: args.name,
      maxWeight: args.max_weight ?? null,
      sortOrder: args.sort_order,
      dryRun,
    });
  });

  registerWriteTool(server, limiter, 'update_storage', TOOL_SCHEMAS.update_storage, async (raw, dryRun) => {
    const args = raw as unknown as UpdateStorageInput;
    return client.updateStorage(args.storage_id, storagePatch(args, dryRun));
  });

  registerWriteTool(server, limiter, 'delete_storage', TOOL_SCHEMAS.delete_storage, async (raw, dryRun) => {
    const args = raw as unknown as { storage_id: number };
    return client.deleteStorage(args.storage_id, { dryRun });
  });

  registerWriteTool(
    server,
    limiter,
    'auto_arrange_storage',
    TOOL_SCHEMAS.auto_arrange_storage,
    async (raw, dryRun) => {
      const args = raw as unknown as { storage_id: number };
      return client.autoArrangeStorage(args.storage_id, dryRun);
    },
  );

  registerWriteTool(
    server,
    limiter,
    'set_container_artifacts',
    TOOL_SCHEMAS.set_container_artifacts,
    async (raw, dryRun) => {
      const args = raw as unknown as { container_item_id: number; slots: (number | null)[] };
      return client.setContainerArtifacts({
        containerItemId: args.container_item_id,
        slots: args.slots,
        dryRun,
      });
    },
  );

  registerWriteTool(
    server,
    limiter,
    'set_weapon_modification',
    TOOL_SCHEMAS.set_weapon_modification,
    async (raw, dryRun) => {
      const args = raw as unknown as {
        weapon_item_id: number;
        slot: string;
        modification_item_id: number | null;
        allow_unverified: boolean;
      };
      return client.setWeaponModification(args.weapon_item_id, args.slot, {
        modificationItemId: args.modification_item_id,
        allowUnverified: args.allow_unverified,
        dryRun,
      });
    },
  );

  registerWriteTool(server, limiter, 'set_item_layout', TOOL_SCHEMAS.set_item_layout, async (raw, dryRun) => {
    const args = raw as unknown as {
      item_id: number;
      width: number;
      height: number;
      weight: number | null;
    };
    return client.setItemLayout({
      itemId: args.item_id,
      width: args.width,
      height: args.height,
      weight: args.weight,
      dryRun,
    });
  });

  server.registerTool(
    'sync_source',
    { description: TOOL_DOCS.sync_source, inputSchema: TOOL_SCHEMAS.sync_source },
    async (args) => {
      if (!args.confirm) {
        return fail('CONFIRM_REQUIRED', 'Sync changes data: pass confirm: true');
      }
      if (!limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok({ result: await client.syncSource(args.source, args.force) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'rebuild_site',
    { description: TOOL_DOCS.rebuild_site, inputSchema: TOOL_SCHEMAS.rebuild_site },
    async () => {
      try {
        return ok({ result: await client.rebuildSite() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'rollback_event',
    { description: TOOL_DOCS.rollback_event, inputSchema: TOOL_SCHEMAS.rollback_event },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok(await client.rollbackEvent(args.event_id, dryRun));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerWriteTool(server, limiter, 'update_logging', TOOL_SCHEMAS.update_logging, async (raw, dryRun) => {
    const args = raw as unknown as {
      enabled: boolean;
      min_level: 'debug' | 'info' | 'warn' | 'error';
      retention_days: number;
      max_rows: number;
      capture_client: boolean;
      client_console: boolean;
      mirror_stdout: boolean;
      levels: Record<string, 'debug' | 'info' | 'warn' | 'error' | 'off' | 'inherit'>;
    };
    return client.updateLogging({
      enabled: args.enabled,
      minLevel: args.min_level,
      retentionDays: args.retention_days,
      maxRows: args.max_rows,
      captureClient: args.capture_client,
      clientConsole: args.client_console,
      mirrorStdout: args.mirror_stdout,
      levels: args.levels as Parameters<ProfileClient['updateLogging']>[0]['levels'],
      dryRun,
    });
  });

  registerWriteTool(server, limiter, 'clear_logs', TOOL_SCHEMAS.clear_logs, async (raw, dryRun) => {
    const args = raw as unknown as {
      scope: 'all' | 'filtered';
      filter?: {
        levels?: ('debug' | 'info' | 'warn' | 'error')[];
        categories?: ('http' | 'sync' | 'mcp' | 'db' | 'app' | 'client')[];
        sources?: ('server' | 'mcp' | 'cli' | 'client')[];
        since?: string;
        until?: string;
        text?: string;
        request_id?: string;
        fingerprint?: string;
        min_duration_ms?: number;
      };
    };
    const filter = args.filter
      ? {
          levels: args.filter.levels,
          categories: args.filter.categories,
          sources: args.filter.sources,
          since: args.filter.since,
          until: args.filter.until,
          text: args.filter.text,
          requestId: args.filter.request_id,
          fingerprint: args.filter.fingerprint,
          minDurationMs: args.filter.min_duration_ms,
        }
      : undefined;
    return client.clearLogs({ scope: args.scope, filter, dryRun });
  });

  server.registerResource(
    'schema',
    'profile://schema',
    {
      title: 'Profile MCP schema',
      description: 'Profile tools, their purpose and the dry_run/confirm rule',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              tools: Object.entries(TOOL_DOCS).map(([name, description]) => ({ name, description })),
              writePolicy: {
                default: 'dry_run=true',
                apply: 'dry_run=false + confirm=true',
                rateLimit: '30 writes per minute',
              },
              export: 'export_profile_json returns the portable profile JSON shape',
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  return server;
}
