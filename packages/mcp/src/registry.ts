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
} from '@dossier/shared/schemas';
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
    message: 'Укажите id или name',
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

const ContentBlockInputSchema = z.object({
  kind: z.enum(['recs', 'earnings', 'notes', 'builds_meta', 'catalog_meta']),
  slug: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  lead: z.string().max(2000).nullish(),
  payload: z.unknown(),
  position: z.number().int().nonnegative().default(0),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

const SyncSourceInputSchema = z.object({
  source: z.enum(['exbo', 'wiki', 'motifs', 'profile', 'scpmodel']),
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
  { name: 'get_item', args: { name: 'KS-1' } },
  { name: 'compare_items', args: { a: 'АК-12', b: 'HK416', level: 15 } },
  { name: 'list_owned', args: {} },
  { name: 'list_containers', args: {} },
  { name: 'list_builds', args: {} },
  { name: 'get_build', args: { slug: 'max-1m' } },
  { name: 'plan_artifact_build', args: { preset: 'speed', slots: 3 } },
  { name: 'get_prices', args: { names: ['KS-1'] } },
  { name: 'sources_status', args: {} },
  { name: 'export_legacy_json', args: {} },
];

/** Loose zod shape of every read tool result, so the smoke fails loudly on malformed output. */
export const READ_OUTPUT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  get_character: z.object({ character: z.record(z.string(), z.unknown()).nullable() }),
  find_items: z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
  get_item: z.object({
    item: z.object({
      name: z.string(),
      stats: z.array(z.record(z.string(), z.unknown())),
      icon: z.string().nullable(),
    }),
  }),
  compare_items: z.object({ items: z.array(z.object({ found: z.boolean() }).loose()) }),
  list_owned: z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
  list_containers: z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
  list_builds: z.object({
    builds: z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
  }),
  get_build: z.object({ build: z.record(z.string(), z.unknown()) }),
  plan_artifact_build: z.object({
    plan: z.object({ picked: z.array(z.record(z.string(), z.unknown())) }),
  }),
  get_prices: z.object({ prices: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }),
  sources_status: z.object({
    sources: z.array(z.object({ id: z.string(), status: z.string() }).loose()),
  }),
  export_legacy_json: z.object({ dossier: z.record(z.string(), z.unknown()) }),
};

const TOOL_DOCS: Record<string, string> = {
    get_character: 'Профиль и статистика персонажа из досье',
    find_items: 'Поиск предметов каталога по названию, типу, рангу и слоту',
    get_item: 'Карточка предмета: характеристики, иконка и исходная legacy-карточка',
    compare_items: 'Сравнить два оружия по DPS и TTK на уровне заточки',
    list_owned: 'Список принадлежащих персонажу предметов',
    list_containers: 'Контейнеры с текущим наполнением',
    list_builds: 'Сборки, текущий набор и список того, чего избегать',
    get_build: 'Одна сборка по slug',
    plan_artifact_build: 'Подобрать артефакты под пресет эффектов, слоты и бюджет',
    get_prices: 'Последние цены аукциона по названиям предметов',
    sources_status: 'Состояние источников данных и свежесть',
    export_legacy_json: 'Экспорт досье в формате исходного legacy JSON',
    upsert_owned_item: 'Добавить или обновить предмет персонажа (по умолчанию dry_run)',
    remove_owned_item: 'Удалить одну копию предмета (по умолчанию dry_run)',
    set_container_artifacts: 'Заменить наполнение контейнера (по умолчанию dry_run)',
    save_build: 'Создать или обновить сборку (по умолчанию dry_run)',
    delete_build: 'Удалить сборку (по умолчанию dry_run)',
    upsert_content_block: 'Записать блок заметок, рекомендаций или заработка (по умолчанию dry_run)',
    sync_source: 'Запустить синхронизацию источника; требует confirm',
    rebuild_site: 'Пересборка сайта деплоем; MCP только сообщает команду',
    rollback_event: 'Откатить событие журнала (по умолчанию dry_run)',
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
    return fail('CONFIRM_REQUIRED', 'Для записи передайте dry_run: false и confirm: true');
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
    { name: 'stalzone-dossier', version: '0.1.0' },
    { instructions: 'Личное досье STALZONE. Чтение свободно; записи по умолчанию dry_run и требуют confirm.' },
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
        if (!item) return fail('ITEM_NOT_FOUND', 'Предмет не найден');
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
        if (!build) return fail('BUILD_NOT_FOUND', 'Сборка не найдена');
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
    'export_legacy_json',
    { description: TOOL_DOCS.export_legacy_json, inputSchema: z.object({}) },
    async () => {
      try {
        return ok({ dossier: await client.exportLegacyJson() });
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
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
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
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
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
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
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
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
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
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
      try {
        return ok(await client.deleteBuild(args.slug, dryRun));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'upsert_content_block',
    { description: TOOL_DOCS.upsert_content_block, inputSchema: ContentBlockInputSchema },
    async (args) => {
      const dryRun = args.dry_run ?? true;
      const gate = confirmation(dryRun, args.confirm ?? false);
      if (gate) return gate;
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
      try {
        return ok(
          await client.upsertContentBlock({
            kind: args.kind,
            slug: args.slug,
            title: args.title,
            lead: args.lead,
            payload: args.payload,
            position: args.position,
            dryRun,
          }),
        );
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
        return fail('CONFIRM_REQUIRED', 'Синхронизация меняет данные: передайте confirm: true');
      }
      if (!limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
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
      if (!dryRun && !limiter.take()) return fail('RATE_LIMITED', 'Не больше 30 записей в минуту');
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
      description: 'Инструменты досье, их назначение и правило dry_run/confirm',
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
              legacyExport: 'export_legacy_json returns the original dossier JSON shape',
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
