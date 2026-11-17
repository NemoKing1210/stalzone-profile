import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  InventoryItemCreate,
  InventoryItemPatch,
  InventoryItemRead,
  InventoryRead,
  LoggingSettings,
  LoggingSettingsUpdate,
  LogQuery,
  LogQueryResult,
  LogStats,
  PlacementTarget,
  PurgeLogsInput,
  StorageCreate,
  StoragePatch,
  StorageRead,
} from '@profile/shared/contracts';
import {
  WriteError,
  artifactSources,
  autoArrangeStorage,
  buildItemCard,
  buildPayload,
  compareWeapons,
  createInventoryItem,
  createStorage,
  deleteInventoryItem,
  deleteStorage,
  exportProfileJson,
  findItemByKindName,
  getIcon,
  getItemById,
  inventoryRead,
  itemStats,
  itemSummary,
  latestPriceFetchedAt,
  latestPriceRows,
  latestPricesForNames,
  listItemEffects,
  listSourceReads,
  logStats as readLogStats,
  moveInventoryItem,
  planArtifactBuild,
  purgeLogs as clearStoredLogs,
  queryLogs as readStoredLogs,
  rollbackEvent as restoreEvent,
  runExclusive,
  runSync,
  searchItemSummaries,
  searchItems,
  readLoggingSettings,
  setContainerFill,
  setItemLayout,
  setWeaponModule,
  updateInventoryItem,
  updateLoggingSettings as writeLoggingSettings,
  updateStorage,
  type Db,
  type ItemRow,
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

export interface InventoryMoveInput {
  target: PlacementTarget;
  swap?: boolean;
  allowUnverified?: boolean;
  dryRun: boolean;
}

export interface RemoveInventoryItemInput {
  qty?: number;
  dryRun: boolean;
}

export interface DeleteStorageInput {
  moveToStorageId?: number | null;
  dryRun: boolean;
}

export interface ContainerFillInput {
  containerItemId: number;
  slots: (number | null)[];
  dryRun: boolean;
}

export interface WeaponModuleInput {
  attachmentItemId: number | null;
  allowUnverified?: boolean;
  dryRun: boolean;
}

export interface ItemLayoutInput {
  itemId: number;
  width: number;
  height: number;
  weight?: number | null;
  dryRun: boolean;
}

export interface InventoryListQuery {
  kind?: string;
  location?: 'grid' | 'equipment' | 'container' | 'weapon_module' | 'loose';
  storageId?: number;
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
  getInventory(): Promise<InventoryRead>;
  listStorages(): Promise<StorageRead[]>;
  listInventoryItems(query?: InventoryListQuery): Promise<InventoryItemRead[]>;
  listContainers(): Promise<Json[]>;
  planArtifactBuild(input: PlanInput): Promise<Json>;
  getPrices(names: string[], quality?: string | null): Promise<Json>;
  sourcesStatus(): Promise<Json[]>;
  exportProfileJson(): Promise<Json>;
  addInventoryItem(input: InventoryItemCreate): Promise<WriteResult>;
  updateInventoryItem(itemId: number, input: InventoryItemPatch): Promise<WriteResult>;
  removeInventoryItem(itemId: number, input: RemoveInventoryItemInput): Promise<WriteResult>;
  moveInventoryItem(itemId: number, input: InventoryMoveInput): Promise<WriteResult>;
  createStorage(input: StorageCreate): Promise<WriteResult>;
  updateStorage(storageId: number, input: StoragePatch): Promise<WriteResult>;
  deleteStorage(storageId: number, input: DeleteStorageInput): Promise<WriteResult>;
  autoArrangeStorage(storageId: number, dryRun: boolean): Promise<WriteResult>;
  setContainerArtifacts(input: ContainerFillInput): Promise<WriteResult>;
  setWeaponModule(
    weaponItemId: number,
    slot: string,
    input: WeaponModuleInput,
  ): Promise<WriteResult>;
  setItemLayout(input: ItemLayoutInput): Promise<WriteResult>;
  syncSource(source: string, force: boolean): Promise<Json>;
  rebuildSite(): Promise<Json>;
  rollbackEvent(eventId: number, dryRun: boolean): Promise<WriteResult>;
  listLogs(query: LogQuery): Promise<LogQueryResult>;
  logStats(windowHours?: number): Promise<LogStats>;
  getLogging(): Promise<LoggingSettings>;
  updateLogging(input: LoggingSettingsUpdate): Promise<WriteResult>;
  clearLogs(input: PurgeLogsInput): Promise<WriteResult>;
  close?(): Promise<void>;
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

    async getInventory() {
      return inventoryRead(db);
    },

    async listStorages() {
      return inventoryRead(db).storages;
    },

    async listInventoryItems(query = {}) {
      const inventory = inventoryRead(db);
      const all: InventoryItemRead[] = [];
      const visit = (item: InventoryItemRead): void => {
        all.push(item);
        for (const child of item.artifacts ?? []) visit(child);
        for (const child of item.modules ?? []) visit(child);
      };
      for (const storage of inventory.storages) storage.items.forEach(visit);
      for (const item of Object.values(inventory.equipment)) if (item) visit(item);
      inventory.loose.forEach(visit);
      return all.filter(
        (item) =>
          (query.kind == null || item.kind === query.kind) &&
          (query.location == null || item.placement.location === query.location) &&
          (query.storageId == null ||
            (item.placement.location === 'grid' && item.placement.storageId === query.storageId)),
      );
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

    async addInventoryItem(input) {
      try {
        return createInventoryItem(db, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async updateInventoryItem(itemId, input) {
      try {
        return updateInventoryItem(db, itemId, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async removeInventoryItem(itemId, input) {
      try {
        return deleteInventoryItem(db, itemId, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async moveInventoryItem(itemId, input) {
      try {
        return moveInventoryItem(db, itemId, input.target, {
          swap: input.swap,
          allowUnverified: input.allowUnverified,
          dryRun: input.dryRun,
        });
      } catch (error) {
        return writeError(error);
      }
    },

    async createStorage(input) {
      try {
        return createStorage(db, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async updateStorage(storageId, input) {
      try {
        return updateStorage(db, storageId, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async deleteStorage(storageId, input) {
      try {
        return deleteStorage(db, storageId, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async autoArrangeStorage(storageId, dryRun) {
      try {
        return autoArrangeStorage(db, storageId, { dryRun });
      } catch (error) {
        return writeError(error);
      }
    },

    async setContainerArtifacts(input) {
      try {
        return setContainerFill(db, input.containerItemId, input.slots, { dryRun: input.dryRun });
      } catch (error) {
        return writeError(error);
      }
    },

    async setWeaponModule(weaponItemId, slot, input) {
      try {
        return setWeaponModule(db, weaponItemId, slot, input.attachmentItemId, {
          allowUnverified: input.allowUnverified,
          dryRun: input.dryRun,
        });
      } catch (error) {
        return writeError(error);
      }
    },

    async setItemLayout(input) {
      try {
        return setItemLayout(
          db,
          input.itemId,
          { width: input.width, height: input.height, weight: input.weight },
          { dryRun: input.dryRun },
        );
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

    async listLogs(query) {
      return readStoredLogs(db, query);
    },

    async logStats(windowHours = 24) {
      return readLogStats(db, windowHours);
    },

    async getLogging() {
      return readLoggingSettings(db);
    },

    async updateLogging(input) {
      try {
        return writeLoggingSettings(db, input);
      } catch (error) {
        return writeError(error);
      }
    },

    async clearLogs(input) {
      try {
        return clearStoredLogs(db, input);
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
    })().catch((error) => {
      // A rejected connect must not poison every later call for the process lifetime.
      connection = null;
      throw error;
    });
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
    async getInventory() {
      return (await call('get_inventory')) as unknown as InventoryRead;
    },
    async listStorages() {
      return (await call('list_storages')).storages as StorageRead[];
    },
    async listInventoryItems(query = {}) {
      return (
        await call('list_inventory_items', toSnakeDeep(query) as Record<string, unknown>)
      ).items as InventoryItemRead[];
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
    async addInventoryItem(input) {
      return (await call('add_inventory_item', writeArgs(input))) as unknown as WriteResult;
    },
    async updateInventoryItem(itemId, input) {
      return (await call('update_inventory_item', writeArgs({ item_id: itemId, ...input }))) as unknown as WriteResult;
    },
    async removeInventoryItem(itemId, input) {
      return (await call('remove_inventory_item', writeArgs({ item_id: itemId, ...input }))) as unknown as WriteResult;
    },
    async moveInventoryItem(itemId, input) {
      return (await call(
        'move_inventory_item',
        writeArgs({ item_id: itemId, ...input }),
      )) as unknown as WriteResult;
    },
    async createStorage(input) {
      return (await call('create_storage', writeArgs(input))) as unknown as WriteResult;
    },
    async updateStorage(storageId, input) {
      return (await call(
        'update_storage',
        writeArgs({ storage_id: storageId, ...input }),
      )) as unknown as WriteResult;
    },
    async deleteStorage(storageId, input) {
      return (await call(
        'delete_storage',
        writeArgs({ storage_id: storageId, ...input }),
      )) as unknown as WriteResult;
    },
    async autoArrangeStorage(storageId, dryRun) {
      return (await call(
        'auto_arrange_storage',
        writeArgs({ storage_id: storageId, dry_run: dryRun }),
      )) as unknown as WriteResult;
    },
    async setContainerArtifacts(input) {
      return (await call(
        'set_container_artifacts',
        writeArgs({ container_item_id: input.containerItemId, slots: input.slots, dry_run: input.dryRun }),
      )) as unknown as WriteResult;
    },
    async setWeaponModule(weaponItemId, slot, input) {
      return (await call(
        'set_weapon_module',
        writeArgs({
          weapon_item_id: weaponItemId,
          slot,
          attachment_item_id: input.attachmentItemId,
          allow_unverified: input.allowUnverified ?? false,
          dry_run: input.dryRun,
        }),
      )) as unknown as WriteResult;
    },
    async setItemLayout(input) {
      return (await call(
        'set_item_layout',
        writeArgs({
          item_id: input.itemId,
          width: input.width,
          height: input.height,
          weight: input.weight ?? null,
          dry_run: input.dryRun,
        }),
      )) as unknown as WriteResult;
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
    async listLogs(query) {
      return (await call('list_logs', toSnakeDeep(query) as Record<string, unknown>)) as unknown as LogQueryResult;
    },
    async logStats(windowHours = 24) {
      return (await call('log_stats', { window_hours: windowHours })) as unknown as LogStats;
    },
    async getLogging() {
      return (await call('get_logging')) as unknown as LoggingSettings;
    },
    async updateLogging(input) {
      return (await call('update_logging', writeArgs(input))) as unknown as WriteResult;
    },
    async clearLogs(input) {
      return (await call('clear_logs', writeArgs(input))) as unknown as WriteResult;
    },
    async close() {
      const pending = connection;
      connection = null;
      if (!pending) return;
      try {
        const client = await pending;
        await client.close();
      } catch {
        /* the connection never became usable */
      }
    },
  };
}

/** Transport args for a write tool: snake_case, and confirm satisfied by the registry gate above this client. */
function writeArgs(input: object): Record<string, unknown> {
  return { ...(toSnakeDeep(input) as Record<string, unknown>), confirm: true };
}

function toSnakeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        toSnakeDeep(entry),
      ]),
    );
  }
  return value;
}
