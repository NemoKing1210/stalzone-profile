import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ItemKindSchema } from '@profile/shared';
import {
  AddInventoryItemInputSchema,
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
  SetWeaponModuleInputSchema,
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
import { McpClientError, type ProfileClient } from './client.js';

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

const RollbackInputSchema = z.object({
  event_id: z.number().int().positive(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

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
];

/** Loose zod shape of every read tool result, so the smoke fails loudly on malformed output. */
export { READ_OUTPUT_SCHEMAS } from '@profile/shared/contracts';

const TOOL_DOCS: Record<string, string> = {
    get_character: 'Character profile and stats from the profile',
    find_items: 'Search catalog items by name, kind, rank and slot',
    get_item: 'Item card: typed stats, effects, icon and the derived detail card',
    compare_items: 'Compare two weapons by DPS and TTK at a refinement level',
    get_inventory: 'Storages, equipment, the loose tray and the computed loadout',
    list_storages: 'Storages with their grid items and weight',
    list_inventory_items: 'Inventory instances filtered by kind, location or storage',
    list_containers: 'Containers with their current fill',
    plan_artifact_build: 'Pick artifacts for an effect preset, slots and budget',
    get_prices: 'Latest auction prices by item name',
    sources_status: 'Data source state and freshness',
    export_profile_json: 'Export the profile as portable JSON',
    add_inventory_item: 'Add an item instance to the loose tray (dry_run by default)',
    update_inventory_item: 'Change an instance level, quality, rarity or note (dry_run by default)',
    remove_inventory_item: 'Remove an instance or part of a stack (dry_run by default)',
    move_inventory_item: 'Move an instance to a grid cell, slot, container or module (dry_run by default)',
    create_storage: 'Create a stash storage (dry_run by default)',
    update_storage: 'Rename, resize or reorder a storage (dry_run by default)',
    delete_storage: 'Delete a stash, moving or loosening its items (dry_run by default)',
    set_container_artifacts: 'Replace a container fill by instance ids (dry_run by default)',
    set_weapon_module: 'Install or remove a weapon module (dry_run by default)',
    set_item_layout: 'Change a catalog item grid size or weight (dry_run by default)',
    auto_arrange_storage: 'Pack loose items into a storage by first fit (dry_run by default)',
    sync_source: 'Run a source sync (exbo_base, wiki, motifs, scpmodel, icons, profile); requires confirm',
    rebuild_site: 'Site rebuild happens on deploy; MCP only reports the command',
    rollback_event: 'Roll back a journal event (dry_run by default)',
};

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
        rotated: target.rotated,
      };
    case 'equipment':
      return { location: 'equipment', slot: target.slot };
    case 'container':
      return { location: 'container', containerItemId: target.container_item_id, slot: target.slot };
    case 'weapon_module':
      return {
        location: 'weapon_module',
        weaponItemId: target.weapon_item_id,
        slot: target.slot,
        allowUnverified: target.allow_unverified,
      };
    case 'loose':
      return { location: 'loose' };
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
  if (args.note !== undefined) patch.note = args.note;
  if (args.role !== undefined) patch.role = args.role;
  if (args.slot !== undefined) patch.slot = args.slot;
  if (args.qty !== undefined) patch.qty = args.qty;
  if (args.display_name !== undefined) patch.displayName = args.display_name;
  if (args.container !== undefined) patch.container = containerData(args.container);
  return patch;
}

function storagePatch(args: UpdateStorageInput, dryRun: boolean): StoragePatch {
  const patch: StoragePatch = { dryRun };
  if (args.name !== undefined) patch.name = args.name;
  if (args.width !== undefined) patch.width = args.width;
  if (args.height !== undefined) patch.height = args.height;
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
}

/** The single tool registry behind stdio and `/mcp`; transports only carry messages. */
export function createProfileServer(
  client: ProfileClient,
  options: ProfileServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: 'stalzone-profile', version: '0.1.0' },
    { instructions: 'Personal STALZONE profile. Reads are open; writes default to dry_run and require confirm.' },
  );
  const limiter = options.limiter ?? writeLimiter(options.writesPerMinute ?? 30);

  server.registerTool(
    'get_character',
    { description: TOOL_DOCS.get_character, inputSchema: z.object({}) },
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
    { description: TOOL_DOCS.find_items, inputSchema: FindItemsQuerySchema },
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
    { description: TOOL_DOCS.get_item, inputSchema: GetItemInputSchema },
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
    { description: TOOL_DOCS.compare_items, inputSchema: CompareItemsInputSchema },
    async (args) => {
      try {
        return ok({ items: await client.compareItems(args.a, args.b, args.level) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_inventory',
    { description: TOOL_DOCS.get_inventory, inputSchema: z.object({}) },
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
    { description: TOOL_DOCS.list_storages, inputSchema: z.object({}) },
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
      inputSchema: z.object({
        kind: ItemKindSchema.optional(),
        location: z.enum(['grid', 'equipment', 'container', 'weapon_module', 'loose']).optional(),
        storage_id: z.number().int().positive().optional(),
      }),
    },
    async (args) => {
      try {
        return ok({
          items: await client.listInventoryItems({
            kind: args.kind,
            location: args.location,
            storageId: args.storage_id,
          }),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_containers',
    { description: TOOL_DOCS.list_containers, inputSchema: z.object({}) },
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
    { description: TOOL_DOCS.plan_artifact_build, inputSchema: PlanArtifactBuildInputSchema },
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
    { description: TOOL_DOCS.get_prices, inputSchema: GetPricesInputSchema },
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
    { description: TOOL_DOCS.sources_status, inputSchema: z.object({}) },
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
    { description: TOOL_DOCS.export_profile_json, inputSchema: z.object({}) },
    async () => {
      try {
        return ok({ profile: await client.exportProfileJson() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerWriteTool(
    server,
    limiter,
    'add_inventory_item',
    AddInventoryItemInputSchema,
    async (raw, dryRun) => {
      const args = raw as unknown as AddInventoryItemInput;
      return client.addInventoryItem({
        name: args.name,
        kind: args.kind,
        level: args.level,
        skin: args.skin ?? null,
        quality: args.quality ?? null,
        rarityPct: args.rarity_pct ?? null,
        rarityTier: args.rarity_tier ?? null,
        note: args.note ?? null,
        role: args.role ?? null,
        slot: args.slot ?? null,
        qty: args.qty,
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
    UpdateInventoryItemInputSchema,
    async (raw, dryRun) => {
      const args = raw as unknown as UpdateInventoryItemInput;
      return client.updateInventoryItem(args.item_id, itemPatch(args, dryRun));
    },
  );

  registerWriteTool(
    server,
    limiter,
    'remove_inventory_item',
    RemoveInventoryItemInputSchema,
    async (raw, dryRun) => {
      const args = raw as unknown as { item_id: number; qty?: number };
      return client.removeInventoryItem(args.item_id, { qty: args.qty, dryRun });
    },
  );

  registerWriteTool(
    server,
    limiter,
    'move_inventory_item',
    MoveInventoryItemInputSchema,
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

  registerWriteTool(server, limiter, 'create_storage', CreateStorageInputSchema, async (raw, dryRun) => {
    const args = raw as unknown as {
      kind: 'inventory' | 'stash';
      name: string;
      width: number;
      height: number;
      max_weight?: number | null;
      sort_order?: number;
    };
    return client.createStorage({
      kind: args.kind,
      name: args.name,
      width: args.width,
      height: args.height,
      maxWeight: args.max_weight ?? null,
      sortOrder: args.sort_order,
      dryRun,
    });
  });

  registerWriteTool(server, limiter, 'update_storage', UpdateStorageInputSchema, async (raw, dryRun) => {
    const args = raw as unknown as UpdateStorageInput;
    return client.updateStorage(args.storage_id, storagePatch(args, dryRun));
  });

  registerWriteTool(server, limiter, 'delete_storage', DeleteStorageInputSchema, async (raw, dryRun) => {
    const args = raw as unknown as { storage_id: number; move_to_storage_id: number | null };
    return client.deleteStorage(args.storage_id, {
      moveToStorageId: args.move_to_storage_id,
      dryRun,
    });
  });

  registerWriteTool(
    server,
    limiter,
    'auto_arrange_storage',
    AutoArrangeStorageInputSchema,
    async (raw, dryRun) => {
      const args = raw as unknown as { storage_id: number };
      return client.autoArrangeStorage(args.storage_id, dryRun);
    },
  );

  registerWriteTool(
    server,
    limiter,
    'set_container_artifacts',
    SetContainerArtifactsInputSchema,
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
    'set_weapon_module',
    SetWeaponModuleInputSchema,
    async (raw, dryRun) => {
      const args = raw as unknown as {
        weapon_item_id: number;
        slot: string;
        attachment_item_id: number | null;
        allow_unverified: boolean;
      };
      return client.setWeaponModule(args.weapon_item_id, args.slot, {
        attachmentItemId: args.attachment_item_id,
        allowUnverified: args.allow_unverified,
        dryRun,
      });
    },
  );

  registerWriteTool(server, limiter, 'set_item_layout', SetItemLayoutInputSchema, async (raw, dryRun) => {
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
    { description: TOOL_DOCS.sync_source, inputSchema: SyncSourceInputSchema },
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
    { description: TOOL_DOCS.rebuild_site, inputSchema: z.object({}) },
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
    { description: TOOL_DOCS.rollback_event, inputSchema: RollbackInputSchema },
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
