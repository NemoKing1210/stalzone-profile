import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ItemKindSchema } from '@dossier/shared';
import {
  CompareItemsInputSchema,
  FindItemsQuerySchema,
  OwnedItemInputSchema,
  PlanArtifactBuildInputSchema,
  RemoveOwnedInputSchema,
  SetContainerArtifactsInputSchema,
} from '@dossier/shared/contracts';
import { McpClientError, type DossierClient } from './client.js';

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

const GetBuildInputSchema = z.object({ slug: z.string().min(1) });

const GetPricesInputSchema = z.object({
  names: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(100)]),
  quality: z.string().nullish(),
});

const BuildSlotInputSchema = z.object({
  name: z.string().nullish(),
  quality: z.string().nullish(),
  rank: z.string().nullish(),
  price: z.number().int().nonnegative().nullish(),
  lots: z.number().int().nonnegative().nullish(),
  eff: z.string().nullish(),
  bonus: z.string().nullish(),
  minus: z.string().nullish(),
  why: z.string().nullish(),
});

const SaveBuildInputSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/i),
  title: z.string().min(1).max(200),
  short: z.string().max(100).nullish(),
  tag: z.string().max(100).nullish(),
  goal: z.string().max(1000).nullish(),
  container: z.string().max(200).nullish(),
  slots: z.number().int().nonnegative().nullish(),
  eff: z.number().nullish(),
  budget: z.number().int().nonnegative().nullish(),
  total: z.number().int().nonnegative().nullish(),
  verdict: z.string().max(2000).nullish(),
  metrics: z.array(z.object({ l: z.string(), v: z.string(), s: z.string().nullish() })).nullish(),
  rows: z.array(BuildSlotInputSchema).default([]),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

const DeleteBuildInputSchema = z.object({
  slug: z.string().min(1),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
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
  { name: 'list_owned', args: {} },
  { name: 'list_containers', args: {} },
  { name: 'list_builds', args: {} },
  { name: 'get_build', args: { slug: 'speed' } },
  { name: 'plan_artifact_build', args: { preset: 'speed', slots: 3 } },
  { name: 'get_prices', args: { names: ['АК-12'] } },
  { name: 'sources_status', args: {} },
  { name: 'export_dossier_json', args: {} },
];

/** Loose zod shape of every read tool result, so the smoke fails loudly on malformed output. */
export { READ_OUTPUT_SCHEMAS } from '@dossier/shared/contracts';

const TOOL_DOCS: Record<string, string> = {
    get_character: 'Character profile and stats from the dossier',
    find_items: 'Search catalog items by name, kind, rank and slot',
    get_item: 'Item card: typed stats, effects, icon and the derived detail card',
    compare_items: 'Compare two weapons by DPS and TTK at a refinement level',
    list_owned: 'Items owned by the character',
    list_containers: 'Containers with their current fill',
    list_builds: 'Builds, the current loadout and what to avoid',
    get_build: 'A single build by slug',
    plan_artifact_build: 'Pick artifacts for an effect preset, slots and budget',
    get_prices: 'Latest auction prices by item name',
    sources_status: 'Data source state and freshness',
    export_dossier_json: 'Export the dossier as portable JSON',
    upsert_owned_item: 'Add or update a character item (dry_run by default)',
    remove_owned_item: 'Remove one copy of an item (dry_run by default)',
    set_container_artifacts: 'Replace a container fill (dry_run by default)',
    save_build: 'Create or update a build (dry_run by default)',
    delete_build: 'Delete a build (dry_run by default)',
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

export interface DossierServerOptions {
  writesPerMinute?: number;
  limiter?: WriteLimiter;
}

/** The single tool registry behind stdio and `/mcp`; transports only carry messages. */
export function createDossierServer(
  client: DossierClient,
  options: DossierServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: 'stalzone-profile', version: '0.1.0' },
    { instructions: 'Personal STALZONE dossier. Reads are open; writes default to dry_run and require confirm.' },
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
    'list_owned',
    {
      description: TOOL_DOCS.list_owned,
      inputSchema: z.object({ kind: ItemKindSchema.optional() }),
    },
    async (args) => {
      try {
        return ok({ items: await client.listOwned(args.kind ?? null) });
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
    'list_builds',
    { description: TOOL_DOCS.list_builds, inputSchema: z.object({}) },
    async () => {
      try {
        return ok({ builds: await client.listBuilds() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_build',
    { description: TOOL_DOCS.get_build, inputSchema: GetBuildInputSchema },
    async (args) => {
      try {
        const build = await client.getBuild(args.slug);
        if (!build) return fail('BUILD_NOT_FOUND', 'Build not found');
        return ok({ build });
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
        return ok({ plan: await client.planArtifactBuild(args as unknown as Parameters<DossierClient['planArtifactBuild']>[0]) });
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
    'export_dossier_json',
    { description: TOOL_DOCS.export_dossier_json, inputSchema: z.object({}) },
    async () => {
      try {
        return ok({ dossier: await client.exportDossierJson() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'upsert_owned_item',
    { description: TOOL_DOCS.upsert_owned_item, inputSchema: OwnedItemInputSchema },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok(
          await client.upsertOwnedItem({
            name: args.name,
            kind: args.kind,
            level: args.level,
            skin: args.skin,
            quality: args.quality,
            note: args.note,
            role: args.role,
            dryRun,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'remove_owned_item',
    { description: TOOL_DOCS.remove_owned_item, inputSchema: RemoveOwnedInputSchema },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok(
          await client.removeOwnedItem({
            name: args.name,
            kind: args.kind,
            level: args.level,
            dryRun,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'set_container_artifacts',
    { description: TOOL_DOCS.set_container_artifacts, inputSchema: SetContainerArtifactsInputSchema },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok(
          await client.setContainerArtifacts({
            container: args.container,
            artifacts: args.artifacts,
            asOf: args.as_of ?? null,
            dryRun,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'save_build',
    { description: TOOL_DOCS.save_build, inputSchema: SaveBuildInputSchema },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok(
          await client.saveBuild({
            slug: args.slug,
            title: args.title,
            short: args.short,
            tag: args.tag,
            goal: args.goal,
            container: args.container,
            slots: args.slots,
            eff: args.eff,
            budget: args.budget,
            total: args.total,
            verdict: args.verdict,
            metrics: args.metrics,
            rows: args.rows,
            dryRun,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'delete_build',
    { description: TOOL_DOCS.delete_build, inputSchema: DeleteBuildInputSchema },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'No more than 30 writes per minute');
      try {
        return ok(await client.deleteBuild(args.slug, dryRun));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

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
    'dossier://schema',
    {
      title: 'Dossier MCP schema',
      description: 'Dossier tools, their purpose and the dry_run/confirm rule',
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
              export: 'export_dossier_json returns the portable dossier JSON shape',
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
