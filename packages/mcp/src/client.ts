import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { norm } from '@profile/shared';
import {
  WriteError,
  artifactSources,
  buildItemCard,
  buildPayload,
  compareWeapons,
  createOwned,
  deleteOwned,
  exportProfileJson,
  findItemByKindName,
  getCharacter,
  getIcon,
  getItemById,
  getOwnedContainer,
  itemStats,
  itemSummary,
  latestPriceFetchedAt,
  latestPriceRows,
  latestPricesForNames,
  listItemEffects,
  listOwned,
  listSourceReads,
  planArtifactBuild,
  rollbackEvent as restoreEvent,
  runExclusive,
  runSync,
  searchItemSummaries,
  searchItems,
  setContainerFill,
  type Db,
  type ItemRow,
  type OwnedJoined,
  type PlanInput,
  type PriceQuote,
  type PriceRow,
  type SyncOptions,
  type WriteResult,
} from '@profile/core';

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

/** Everything the MCP tools need from a profile, whether it lives in this process or behind HTTP. */
export interface ProfileClient {
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
  planArtifactBuild(input: PlanInput): Promise<Json>;
  getPrices(names: string[], quality?: string | null): Promise<Json>;
  sourcesStatus(): Promise<Json[]>;
  exportProfileJson(): Promise<Json>;
  upsertOwnedItem(input: OwnedWriteInput): Promise<WriteResult>;
  removeOwnedItem(input: RemoveOwnedInput): Promise<WriteResult>;
  setContainerArtifacts(input: ContainerFillInput): Promise<WriteResult>;
  syncSource(source: string, force: boolean): Promise<Json>;
  rebuildSite(): Promise<Json>;
  rollbackEvent(eventId: number, dryRun: boolean): Promise<WriteResult>;
  close?(): Promise<void>;
}

function ownedJson(db: Db, row: OwnedJoined): Json {
  const container = getOwnedContainer(db, row.id);
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

function priceQuote(row: PriceRow | undefined): PriceQuote | null {
  if (!row) return null;
  return {
    price: row.lot_price ?? row.current_price ?? row.last_trade ?? null,
    quality: row.quality,
    lots: row.lot_count,
    source: row.source_id,
    updated: row.lot_updated_at ?? row.fetched_at,
  };
}

function priceJson(row: PriceRow): Json {
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
 * PROFILE_API_URL. Sync options are forwarded so both hosts resolve them the
 * same way the CLI and the admin route do; `force` always comes from the tool.
 */
export function localClient(db: Db, syncOptions: LocalClientOptions = {}): ProfileClient {
  return {
    async getCharacter() {
      const payload = buildPayload(db);
      return { character: payload.character, meta: payload.meta };
    },

    async findItems(query) {
      return searchItemSummaries(db, {
        q: query.q ?? null,
        kind: query.kind ?? null,
        rank: query.rank ?? null,
        slot: query.slot ?? null,
        limit: query.limit ?? 20,
      });
    },

    async getItem(query) {
      let item: ItemRow | null = null;
      if (query.id != null) item = getItemById(db, query.id);
      else if (query.name) {
        const kind = query.kind ?? 'weapon';
        item =
          findItemByKindName(db, kind, query.name) ??
          findItemByKindName(db, 'armor', query.name) ??
          findItemByKindName(db, 'container', query.name) ??
          findItemByKindName(db, 'artifact', query.name) ??
          searchItems(db, { q: query.name, limit: 1 })[0] ??
          null;
      }
      if (!item) return null;
      return {
        ...itemSummary(item, getIcon(db, item.id)?.path ?? null),
        stats: itemStats(db, item.id),
        effects: listItemEffects(db, item.id),
        card: buildItemCard(db, item),
      };
    },

    async compareItems(a, b, level) {
      return compareWeapons(db, [a, b], level) as Json[];
    },

    async listOwned(kind) {
      const character = getCharacter(db);
      if (!character) return [];
      return listOwned(db, character.id, kind ?? undefined).map((row) => ownedJson(db, row));
    },

    async listContainers() {
      return buildPayload(db).containers as Json[];
    },

    async planArtifactBuild(input) {
      const artifacts = artifactSources(db) as Parameters<typeof planArtifactBuild>[1]['artifacts'];
      const latest = latestPriceFetchedAt(db);
      const age = latest ? Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000)) : 0;
      return planArtifactBuild(input, {
        artifacts,
        price: (name, quality) => priceQuote(latestPriceRows(db, name, quality ?? null)[0]),
        pricesAgeMin: () => age,
      }) as unknown as Json;
    },

    async getPrices(names, quality) {
      if (quality) {
        return Object.fromEntries(
          names.map((name) => [name, latestPriceRows(db, name, quality).map(priceJson)]),
        );
      }
      return Object.fromEntries(
        Object.entries(latestPricesForNames(db, names)).map(([name, rows]) => [
          name,
          rows.map(priceJson),
        ]),
      );
    },

    async sourcesStatus() {
      return listSourceReads(db);
    },

    async exportProfileJson() {
      return exportProfileJson(db) as Json;
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
      const character = getCharacter(db);
      if (!character) throw new McpClientError('NO_CHARACTER', 'No character in the profile');
      const target = listOwned(db, character.id, input.kind).find(
          (row) =>
            norm(row.display_name ?? row.item_name) === norm(input.name) &&
            (input.level == null || row.level === input.level),
        );
      if (!target) {
        throw new McpClientError('OWNED_NOT_FOUND', `${input.name} is not in the profile for this kind`);
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

    async syncSource(source, force) {
      try {
        const options = { ...syncOptions, force };
        return (await runExclusive(() =>
          runSync(db, source === 'exbo' ? 'exbo_base' : source, options),
        )) as unknown as Json;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('unknown source')) {
          throw new McpClientError('UNKNOWN_SOURCE', error.message);
        }
        return writeError(error);
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
 * Client for a remote profile over its MCP endpoint. Tools are the same registry, so
 * stdio-over-HTTP and `/mcp` cannot drift from the local implementation.
 */
export function httpClient(baseUrl: string, token: string): ProfileClient {
  let connection: Promise<Client> | null = null;

  function connect(): Promise<Client> {
    connection ??= (async () => {
      const client = new Client({ name: 'profile-stdio', version: '0.1.0' });
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
    async planArtifactBuild(input) {
      return (await call('plan_artifact_build', input as Record<string, unknown>)).plan as Json;
    },
    async getPrices(names, quality) {
      return (await call('get_prices', quality ? { names, quality } : { names })).prices as Json;
    },
    async sourcesStatus() {
      return (await call('sources_status')).sources as Json[];
    },
    async exportProfileJson() {
      return (await call('export_profile_json')).profile as Json;
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
