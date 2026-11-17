import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { norm } from '@dossier/shared';
import type { Db } from '@dossier/core/db';
import * as repo from '@dossier/core/repo';
import { artifactSources, buildPayload, compareWeapons } from '@dossier/core/services/payload';
import { buildItemCard } from '@dossier/core/services/catalog-view';
import { exportDossierJson } from '@dossier/core/services/export';
import {
  createOwned,
  deleteBuild as removeBuild,
  deleteOwned,
  rollbackEvent as restoreEvent,
  saveBuild as persistBuild,
  setContainerFill,
  WriteError,
  type WriteResult,
} from '@dossier/core/services/writes';
import { planArtifactBuild, type PlanInput, type PriceQuote } from '@dossier/core/calc';
import { runSync, type SyncOptions } from '@dossier/core/services/sync';

type Json = Record<string, unknown>;

export class McpClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'McpClientError';
  }
}

export interface OwnedWriteInput {
  name: string;
  kind: string;
  level: number;
  skin?: string | null;
  quality?: string | null;
  note?: string | null;
  role?: string | null;
  dryRun: boolean;
}

export interface RemoveOwnedInput {
  name: string;
  kind: string;
  level?: number | null;
  dryRun: boolean;
}

export interface ContainerFillInput {
  container: string;
  artifacts: { name: string; level: number; quality?: string | null }[];
  asOf?: string | null;
  dryRun: boolean;
}

export interface BuildWriteInput {
  slug: string;
  title: string;
  short?: string | null;
  tag?: string | null;
  goal?: string | null;
  container?: string | null;
  slots?: number | null;
  eff?: number | null;
  budget?: number | null;
  total?: number | null;
  verdict?: string | null;
  metrics?: { l: string; v: string; s?: string | null }[] | null;
  rows: {
    name?: string | null;
    quality?: string | null;
    rank?: string | null;
    price?: number | null;
    lots?: number | null;
    eff?: string | null;
    bonus?: string | null;
    minus?: string | null;
    why?: string | null;
  }[];
  dryRun: boolean;
}

/** Everything the MCP tools need from a dossier, whether it lives in this process or behind HTTP. */
export interface DossierClient {
  getCharacter(): Promise<Json>;
  findItems(query: {
    q?: string | null;
    kind?: string | null;
    rank?: string | null;
    slot?: string | null;
    limit?: number;
  }): Promise<Json[]>;
  getItem(query: { id?: number; name?: string; kind?: string }): Promise<Json | null>;
  compareItems(a: string, b: string, level: number): Promise<Json[]>;
  listOwned(kind?: string | null): Promise<Json[]>;
  listContainers(): Promise<Json[]>;
  listBuilds(): Promise<Json>;
  getBuild(slug: string): Promise<Json | null>;
  planArtifactBuild(input: PlanInput): Promise<Json>;
  getPrices(names: string[], quality?: string | null): Promise<Json>;
  sourcesStatus(): Promise<Json[]>;
  exportDossierJson(): Promise<Json>;
  upsertOwnedItem(input: OwnedWriteInput): Promise<WriteResult>;
  removeOwnedItem(input: RemoveOwnedInput): Promise<WriteResult>;
  setContainerArtifacts(input: ContainerFillInput): Promise<WriteResult>;
  saveBuild(input: BuildWriteInput): Promise<WriteResult>;
  deleteBuild(slug: string, dryRun: boolean): Promise<WriteResult>;
  syncSource(source: string, force: boolean): Promise<Json>;
  rebuildSite(): Promise<Json>;
  rollbackEvent(eventId: number, dryRun: boolean): Promise<WriteResult>;
  close?(): Promise<void>;
}

function iconOf(db: Db, item: repo.ItemRow): string | null {
  return repo.getIcon(db, item.id)?.path ?? null;
}

function itemSummary(db: Db, item: repo.ItemRow): Json {
  return {
    id: item.id,
    externalId: item.external_id,
    name: item.name,
    nameEn: item.name_en,
    kind: item.kind,
    category: item.category,
    rank: item.rank,
    slot: item.slot,
    weight: item.weight,
    cosmetic: !!item.is_cosmetic,
    icon: iconOf(db, item),
  };
}

function ownedJson(db: Db, row: repo.OwnedJoined): Json {
  const container = repo.getOwnedContainer(db, row.id);
  return {
    ownedId: row.id,
    itemId: row.item_id,
    name: row.display_name ?? row.item_name,
    externalId: row.external_id,
    kind: row.kind,
    level: row.level,
    quality: row.quality,
    skinItemId: row.skin_item_id,
    skinName: row.skin_name,
    qty: row.qty,
    note: row.note,
    role: row.role,
    slot: row.slot,
    icon: row.item_icon,
    container: container
      ? {
          type: container.container_type,
          shield: container.shield,
          bonus: container.bonus,
          protection: container.protection,
          slots: container.slots,
          eff: container.eff,
        }
      : null,
  };
}

function priceQuote(row: repo.PriceRow | undefined): PriceQuote | null {
  if (!row) return null;
  return {
    price: row.lot_price ?? row.current_price ?? row.last_trade ?? null,
    quality: row.quality,
    lots: row.lot_count,
    source: row.source_id,
    updated: row.lot_updated_at ?? row.fetched_at,
  };
}

function priceJson(row: repo.PriceRow): Json {
  return {
    name: row.name,
    quality: row.quality,
    bonus: row.bonus,
    lotPrice: row.lot_price,
    lotCount: row.lot_count,
    currentPrice: row.current_price,
    lastTrade: row.last_trade,
    lotUpdatedAt: row.lot_updated_at,
    sourceId: row.source_id,
    fetchedAt: row.fetched_at,
  };
}

function writeError(error: unknown): never {
  if (error instanceof WriteError) throw new McpClientError(error.code, error.message, error.details);
  throw error;
}

/** Environment-specific sync knobs (icon directory, profile API credentials, test fetch). */
export type LocalClientOptions = Pick<SyncOptions, 'iconsDir' | 'profileApi' | 'fetchImpl' | 'cacheDir' | 'realm'>;

/**
 * In-process client used by Nitro's `/mcp` route and the stdio shim without
 * DOSSIER_API_URL. Sync options are forwarded so both hosts resolve them the
 * same way the CLI and the admin route do; `force` always comes from the tool.
 */
export function localClient(db: Db, syncOptions: LocalClientOptions = {}): DossierClient {
  return {
    async getCharacter() {
      const payload = buildPayload(db);
      return { character: payload.character, meta: payload.meta };
    },

    async findItems(query) {
      return repo
        .searchItems(db, {
          q: query.q ?? null,
          kind: query.kind ?? null,
          rank: query.rank ?? null,
          slot: query.slot ?? null,
          limit: query.limit ?? 20,
        })
        .map((item) => itemSummary(db, item));
    },

    async getItem(query) {
      let item: repo.ItemRow | null = null;
      if (query.id != null) item = repo.getItemById(db, query.id);
      else if (query.name) {
        const kind = query.kind ?? 'weapon';
        item =
          repo.findItemByKindName(db, kind, query.name) ??
          repo.findItemByKindName(db, 'armor', query.name) ??
          repo.findItemByKindName(db, 'container', query.name) ??
          repo.findItemByKindName(db, 'artifact', query.name) ??
          repo.searchItems(db, { q: query.name, limit: 1 })[0] ??
          null;
      }
      if (!item) return null;
      return {
        ...itemSummary(db, item),
        stats: repo.itemStats(db, item.id),
        effects: repo.listItemEffects(db, item.id),
        card: buildItemCard(db, item),
      };
    },

    async compareItems(a, b, level) {
      return compareWeapons(db, [a, b], level) as Json[];
    },

    async listOwned(kind) {
      const character = repo.getCharacter(db);
      if (!character) return [];
      return repo.listOwned(db, character.id, kind ?? undefined).map((row) => ownedJson(db, row));
    },

    async listContainers() {
      return buildPayload(db).containers as Json[];
    },

    async listBuilds() {
      return buildPayload(db).builds as Json;
    },

    async getBuild(slug) {
      const build = (buildPayload(db).builds as { items?: Json[] }).items?.find(
        (item) => item.id === slug,
      );
      return build ?? null;
    },

    async planArtifactBuild(input) {
      const artifacts = artifactSources(db) as Parameters<typeof planArtifactBuild>[1]['artifacts'];
      const latest = repo.latestPriceFetchedAt(db);
      const age = latest ? Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000)) : 0;
      return planArtifactBuild(input, {
        artifacts,
        price: (name, quality) => priceQuote(repo.latestPriceRows(db, name, quality ?? null)[0]),
        pricesAgeMin: () => age,
      }) as unknown as Json;
    },

    async getPrices(names, quality) {
      if (quality) {
        return Object.fromEntries(
          names.map((name) => [name, repo.latestPriceRows(db, name, quality).map(priceJson)]),
        );
      }
      return Object.fromEntries(
        Object.entries(repo.latestPricesForNames(db, names)).map(([name, rows]) => [
          name,
          rows.map(priceJson),
        ]),
      );
    },

    async sourcesStatus() {
      return repo.listSources(db).map((source) => ({
        id: source.id,
        status: source.status,
        lastOkAt: source.last_ok_at,
        lastTryAt: source.last_try_at,
        lastError: source.last_error,
      }));
    },

    async exportDossierJson() {
      return exportDossierJson(db) as Json;
    },

    async upsertOwnedItem(input) {
      try {
        return createOwned(db, {
          name: input.name,
          kind: input.kind as 'weapon',
          level: input.level,
          skin: input.skin ?? null,
          quality: input.quality ?? null,
          note: input.note ?? null,
          role: input.role ?? null,
          qty: 1,
          dryRun: input.dryRun,
        });
      } catch (error) {
        return writeError(error);
      }
    },

    async removeOwnedItem(input) {
      const character = repo.getCharacter(db);
      if (!character) throw new McpClientError('NO_CHARACTER', 'No character in the dossier');
      const target = repo
        .listOwned(db, character.id, input.kind)
        .find(
          (row) =>
            norm(row.display_name ?? row.item_name) === norm(input.name) &&
            (input.level == null || row.level === input.level),
        );
      if (!target) {
        throw new McpClientError('OWNED_NOT_FOUND', `${input.name} is not in the dossier for this kind`);
      }
      try {
        return deleteOwned(db, target.id, { dryRun: input.dryRun, qty: 1 });
      } catch (error) {
        return writeError(error);
      }
    },

    async setContainerArtifacts(input) {
      const container = (buildPayload(db).containers as Json[]).find(
        (row) => norm(String(row.name)) === norm(input.container),
      );
      if (!container?.ownedId) {
        throw new McpClientError('CONTAINER_NOT_FOUND', `Container ${input.container} not found`);
      }
      try {
        return setContainerFill(db, Number(container.ownedId), {
          artifacts: input.artifacts,
          asOf: input.asOf ?? null,
          dryRun: input.dryRun,
        });
      } catch (error) {
        return writeError(error);
      }
    },

    async saveBuild(input) {
      try {
        return persistBuild(db, {
          slug: input.slug,
          title: input.title,
          short: input.short ?? null,
          tag: input.tag ?? null,
          goal: input.goal ?? null,
          container: input.container ?? null,
          slots: input.slots ?? null,
          eff: input.eff ?? null,
          budget: input.budget ?? null,
          total: input.total ?? null,
          metrics: input.metrics ?? null,
          verdict: input.verdict ?? null,
          rows: input.rows,
          dryRun: input.dryRun,
        });
      } catch (error) {
        return writeError(error);
      }
    },

    async deleteBuild(slug, dryRun) {
      try {
        return removeBuild(db, slug, dryRun);
      } catch (error) {
        return writeError(error);
      }
    },

    async syncSource(source, force) {
      try {
        const options = { ...syncOptions, force };
        return (await runSync(db, source === 'exbo' ? 'exbo_base' : source, options)) as unknown as Json;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('unknown source')) {
          throw new McpClientError('UNKNOWN_SOURCE', error.message);
        }
        throw error;
      }
    },

    async rebuildSite() {
      throw new McpClientError(
        'NOT_SUPPORTED',
        'The site is rebuilt by deploy: npm run build or docker compose build && up -d',
      );
    },

    async rollbackEvent(eventId, dryRun) {
      try {
        return restoreEvent(db, eventId, dryRun);
      } catch (error) {
        return writeError(error);
      }
    },
  };
}

interface ToolCallResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

function unwrap(raw: unknown): Json {
  const result = raw as ToolCallResult;
  if (result.isError) {
    const text = result.content
      .map((entry) => (entry.type === 'text' ? (entry.text ?? '') : ''))
      .join(' ')
      .trim();
    let code = 'MCP_ERROR';
    let message = text || 'The tool failed';
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
      if (parsed.error?.code) code = parsed.error.code;
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* plain text error */
    }
    throw new McpClientError(code, message);
  }
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent as Json;
  }
  const text = result.content.find((entry) => entry.type === 'text')?.text;
  return text ? (JSON.parse(text) as Json) : {};}

/**
 * Client for a remote dossier over its MCP endpoint. Tools are the same registry, so
 * stdio-over-HTTP and `/mcp` cannot drift from the local implementation.
 */
export function httpClient(baseUrl: string, token: string): DossierClient {
  let connection: Promise<Client> | null = null;

  function connect(): Promise<Client> {
    connection ??= (async () => {
      const client = new Client({ name: 'dossier-stdio', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(
        new URL(`${baseUrl.replace(/\/+$/, '')}/mcp`),
        {
          requestInit: {
            headers: token ? { authorization: `Bearer ${token}` } : {},
          },
        },
      );
      await client.connect(transport);
      return client;
    })();
    return connection;
  }

  async function call(name: string, args: Record<string, unknown> = {}): Promise<Json> {
    const client = await connect();
    return unwrap(await client.callTool({ name, arguments: args }));
  }

  return {
    async getCharacter() {
      return (await call('get_character')).character as Json;
    },
    async findItems(query) {
      return (await call('find_items', query)).items as Json[];
    },
    async getItem(query) {
      return ((await call('get_item', query)).item ?? null) as Json | null;
    },
    async compareItems(a, b, level) {
      return (await call('compare_items', { a, b, level })).items as Json[];
    },
    async listOwned(kind) {
      return (await call('list_owned', kind ? { kind } : {})).items as Json[];
    },
    async listContainers() {
      return (await call('list_containers')).items as Json[];
    },
    async listBuilds() {
      return (await call('list_builds')).builds as Json;
    },
    async getBuild(slug) {
      return ((await call('get_build', { slug })).build ?? null) as Json | null;
    },
    async planArtifactBuild(input) {
      return (await call('plan_artifact_build', input as Record<string, unknown>)).plan as Json;
    },
    async getPrices(names, quality) {
      return (await call('get_prices', quality ? { names, quality } : { names })).prices as Json;
    },
    async sourcesStatus() {
      return (await call('sources_status')).sources as Json[];
    },
    async exportDossierJson() {
      return (await call('export_dossier_json')).dossier as Json;
    },
    async upsertOwnedItem(input) {
      return (await call('upsert_owned_item', toSnakeWrite(input))) as unknown as WriteResult;
    },
    async removeOwnedItem(input) {
      return (await call('remove_owned_item', toSnakeWrite(input))) as unknown as WriteResult;
    },
    async setContainerArtifacts(input) {
      return (await call('set_container_artifacts', toSnakeWrite(input))) as unknown as WriteResult;
    },
    async saveBuild(input) {
      return (await call('save_build', toSnakeWrite(input))) as unknown as WriteResult;
    },
    async deleteBuild(slug, dryRun) {
      return (await call('delete_build', { slug, dry_run: dryRun })) as unknown as WriteResult;
    },
    async syncSource(source, force) {
      return (await call('sync_source', { source, force, confirm: true })).result as Json;
    },
    async rebuildSite() {
      return (await call('rebuild_site')).result as Json;
    },
    async rollbackEvent(eventId, dryRun) {
      return (await call('rollback_event', {
        event_id: eventId,
        dry_run: dryRun,
        confirm: true,
      })) as unknown as WriteResult;
    },
    async close() {
      if (!connection) return;
      const client = await connection;
      await client.close();
      connection = null;
    },
  };
}

function toSnakeWrite(input: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key === 'dryRun' ? 'dry_run' : key === 'asOf' ? 'as_of' : key] = value;
  }
  return out;
}
