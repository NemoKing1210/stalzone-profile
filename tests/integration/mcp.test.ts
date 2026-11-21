import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  closeDb,
  enqueueLog,
  flushLogs,
  getLogger,
  listEvents,
  migrate,
  openDb,
  queryLogs,
  runExclusive,
  type Db,
} from '@profile/core';
import {
  READ_OUTPUT_SCHEMAS,
  READ_TOOLS,
  connectInMemory,
  createProfileServer,
  createMcpHttpHandler,
  httpClient,
  localClient,
  writeLimiter,
} from '@profile/mcp';
import * as seed from '@profile/core/testing';
import { seedCatalog } from '../fixtures/seed';
import { seedInventory, type SeedInventory } from '../fixtures/inventory';

let dir: string;
let db: Db;
let seeded: SeedInventory;
let server: ReturnType<typeof createProfileServer>;
let client: Client;

const EXPECTED_WRITE_TOOLS = [
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
  'tidy_storage',
  'sync_source',
  'rebuild_site',
  'rollback_event',
  'update_logging',
  'clear_logs',
];
const EXPECTED_READ_TOOLS = [
  'get_character',
  'find_items',
  'describe_catalog',
  'get_item',
  'compare_items',
  'get_inventory',
  'get_inventory_item',
  'get_meta',
  'list_storages',
  'list_inventory_items',
  'list_containers',
  'plan_artifact_build',
  'get_prices',
  'sources_status',
  'export_profile_json',
  'list_logs',
  'log_stats',
  'get_logging',
];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-mcp-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  seedCatalog(db);
  seeded = seedInventory(db);
  server = createProfileServer(localClient(db));
  client = await connectInMemory(server);
});

afterAll(async () => {
  await client.close();
  await server.close();
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function callTool(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

async function inventoryCount(): Promise<number> {
  return (await localClient(db).listInventoryItems()).length;
}

describe('MCP registry', () => {
  it('registers the new tool list and no content writer', async () => {
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools.sort()).toEqual([...EXPECTED_READ_TOOLS, ...EXPECTED_WRITE_TOOLS].sort());
    expect(tools).not.toContain('upsert_content_block');
    expect(tools).not.toContain('export_legacy_json');

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain('profile://schema');
  });

  it('accepts the icon and profile sources in sync_source', async () => {
    const tool = (await client.listTools()).tools.find((entry) => entry.name === 'sync_source');
    const source = (tool?.inputSchema.properties as Record<string, { enum?: string[] }> | undefined)?.source;
    expect(source?.enum).toEqual(expect.arrayContaining(['icons', 'profile']));
  });

  it('returns every read tool result matching its zod schema', async () => {
    for (const tool of READ_TOOLS) {
      const result = await callTool(tool.name, tool.args);
      expect(result.isError, `${tool.name}: ${JSON.stringify(result.content)}`).not.toBe(true);
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured, tool.name).toBeTruthy();
      READ_OUTPUT_SCHEMAS[tool.name].parse(structured);
    }
  });

  it('exports the typed profile', async () => {
    const result = await callTool('export_profile_json', {});
    const profile = (result.structuredContent as { profile: Record<string, any> }).profile;
    expect(profile).not.toHaveProperty('career');
    expect(profile.weapons[0]).not.toHaveProperty('raw');
  });

  it('returns a derived item card', async () => {
    const result = await callTool('get_item', { name: 'АК-12' });
    const item = (result.structuredContent as { item: { card: { p15: { d0: number } }; stats: any[] } }).item;
    expect(item.card.p15.d0).toBe(55);
    expect(item.stats[0]).toHaveProperty('stat_id');
  });

  it('compares DPS/TTK from typed stats', async () => {
    const compared = await callTool('compare_items', { a: 'АК-12', b: 'KS-1', level: 15 });
    const items = (
      compared.structuredContent as {
        items: { found: boolean; metrics: { dps: number | null; ttk: number | null } }[];
      }
    ).items;
    expect(items.map((row) => row.found)).toEqual([true, true]);
    for (const row of items) {
      expect(typeof row.metrics.dps).toBe('number');
      expect(typeof row.metrics.ttk).toBe('number');
    }
  });

  it('compares more than two items and names the best DPS', async () => {
    const compared = await callTool('compare_items', {
      items: ['АК-12', 'KS-1', 'ПП-19'],
      level: 15,
    });
    const body = compared.structuredContent as {
      items: { found: boolean }[];
      best: { dps: string | null };
    };
    expect(body.items).toHaveLength(3);
    expect(body.best.dps).toBe('АК-12');
  });

  it('returns ranked weapons with metrics in one call', async () => {
    const result = await callTool('find_items', {
      kind: 'weapon',
      sort: 'dps',
      direction: 'desc',
      limit: 2,
    });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    const body = result.structuredContent as {
      items: { name: string; metrics: { dps: number | null } }[];
      total: number;
    };
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.items[0].name).toBe('АК-12');
    expect(body.items[0].metrics.dps).toBe(550);
    expect(body.items[1].metrics.dps).toBeLessThan(550);
  });

  it('describes the metric vocabulary', async () => {
    const result = await callTool('describe_catalog', {});
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    const body = result.structuredContent as { metrics: { key: string; direction: string }[] };
    expect(body.metrics.find((metric) => metric.key === 'recoil')?.direction).toBe('lower');
    expect(body.metrics.find((metric) => metric.key === 'dps')?.direction).toBe('higher');
  });
});

describe('MCP inventory reads and moves', () => {
  it('returns storages, equipment and the intake tray', async () => {
    const inventory = await localClient(db).getInventory();
    expect(inventory.storages.map((storage) => storage.kind)).toEqual(['inventory', 'overflow', 'stash']);
    expect(inventory.equipment.primary?.name).toBe('АК-12');
    expect(inventory.equipment.container?.artifacts?.[0]?.name).toBe('Нервяк');
    const intake = inventory.storages.find((storage) => storage.kind === 'overflow');
    expect(intake?.items.map((item) => item.name)).toContain('ПП-19');
    expect(inventory.loose.map((item) => item.name)).not.toContain('ПП-19');
    expect(inventory.stats.carry.total.value).toBeGreaterThan(0);
  });

  it('moves an intake item onto a storage grid and refuses a move back', async () => {
    const local = localClient(db);
    const result = await local.moveInventoryItem(seeded.instanceIds.smg!, {
      target: { location: 'grid', storageId: seeded.storageIds.inventory, x: 0, y: 0 },
      dryRun: false,
    });
    expect(result.dryRun).toBe(false);
    expect(typeof result.eventId).toBe('number');

    const moved = (await local.listInventoryItems()).find((item) => item.id === seeded.instanceIds.smg);
    expect(moved?.placement).toMatchObject({ location: 'grid', storageId: seeded.storageIds.inventory });

    await expect(
      local.moveInventoryItem(seeded.instanceIds.smg!, {
        target: { location: 'grid', storageId: seeded.storageIds.overflow, x: 0, y: 0 },
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PLACEMENT' });
    const restored = (await local.listInventoryItems()).find((item) => item.id === seeded.instanceIds.smg);
    expect(restored?.placement).toMatchObject({ location: 'grid', storageId: seeded.storageIds.inventory });
  });

  it('includes nested artifacts and modules in the flat inventory list', async () => {
    const local = localClient(db);
    const nested = await local.listInventoryItems({ location: 'container' });
    expect(nested.some((item) => item.id === seeded.instanceIds.artifact1)).toBe(true);
    expect(nested.every((item) => item.placement.location === 'container')).toBe(true);
  });
});

describe('MCP write safety', () => {
  it('defaults to dry_run and requires confirm for a real write', async () => {
    const before = await inventoryCount();

    const dry = await callTool('add_inventory_item', { name: 'Пузырь', kind: 'artifact', level: 15 });
    expect(dry.isError).not.toBe(true);
    expect(dry.structuredContent).toMatchObject({ dryRun: true });
    expect(await inventoryCount()).toBe(before);

    const unconfirmed = await callTool('add_inventory_item', {
      name: 'Пузырь',
      kind: 'artifact',
      level: 15,
      dry_run: false,
    });
    expect(unconfirmed.isError).toBe(true);
    expect(JSON.parse((unconfirmed.content as { text: string }[])[0].text)).toMatchObject({
      error: { code: 'CONFIRM_REQUIRED' },
    });
    expect(await inventoryCount()).toBe(before);

    const applied = await callTool('add_inventory_item', {
      name: 'Пузырь',
      kind: 'artifact',
      level: 15,
      dry_run: false,
      confirm: true,
    });
    const body = applied.structuredContent as {
      dryRun: boolean;
      eventId: number;
      diff: { after: { id: number } };
    };
    expect(body.dryRun).toBe(false);
    expect(typeof body.eventId).toBe('number');
    expect(await inventoryCount()).toBe(before + 1);

    const restored = await callTool('remove_inventory_item', {
      item_id: body.diff.after.id,
      dry_run: false,
      confirm: true,
    });
    expect(restored.isError).not.toBe(true);
    expect(await inventoryCount()).toBe(before);
  });

  it('requires confirm before a sync reaches the source', async () => {
    const result = await callTool('sync_source', { source: 'profile' });
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toMatchObject({
      error: { code: 'CONFIRM_REQUIRED' },
    });
  });

  it('reports the unconfigured profile API instead of syncing', async () => {
    const result = await callTool('sync_source', { source: 'profile', confirm: true });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse((result.content as { text: string }[])[0].text) as {
      result: { source: string; status: string; error?: string };
    };
    expect(body.result).toMatchObject({
      source: 'profile',
      status: 'stale',
      error: 'STALZONE_API_NOT_CONFIGURED',
    });
  });

  it('refuses sync_source while another sync holds the process lock', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const held = runExclusive(async () => gate);
    try {
      const result = await callTool('sync_source', { source: 'profile', confirm: true });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content as { text: string }[])[0].text)).toMatchObject({
        error: { code: 'SYNC_IN_PROGRESS' },
      });
    } finally {
      release();
      await held;
    }
  });

  it('stops writes at the shared rate limit', async () => {
    const limited = createProfileServer(localClient(db), { limiter: { take: () => false } });
    const limitedClient = await connectInMemory(limited);
    try {
      const result = await limitedClient.callTool({
        name: 'add_inventory_item',
        arguments: { name: 'Пузырь', kind: 'artifact', level: 15, dry_run: false, confirm: true },
      });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content as { text: string }[])[0].text)).toMatchObject({
        error: { code: 'RATE_LIMITED' },
      });
    } finally {
      await limitedClient.close();
      await limited.close();
    }

    const limiter = writeLimiter(2);
    expect([limiter.take(0), limiter.take(0), limiter.take(0)]).toEqual([true, true, false]);
    expect(limiter.take(60_001)).toBe(true);
  });
});

describe('MCP HTTP transport', () => {
  let httpServer: http.Server;
  let baseUrl: string;
  let remote: ReturnType<typeof httpClient>;

  beforeAll(async () => {
    const handler = createMcpHttpHandler({
      client: localClient(db),
      token: 'test-mcp-token',
      writesPerMinute: 30,
      logger: getLogger(db, 'mcp', { source: 'mcp' }),
      requestId: 'mcp-http-1',
      origin: 'mcp',
    });
    httpServer = http.createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    remote = httpClient(baseUrl, 'test-mcp-token');
  });

  afterAll(async () => {
    await remote.close?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('returns the same result over HTTP as in-process stdio', async () => {
    const overHttp = await remote.getItem({ name: 'АК-12' });
    const inProcess = await localClient(db).getItem({ name: 'АК-12' });
    expect(overHttp).toEqual(inProcess);

    const containersOverHttp = await remote.listContainers();
    const containersInProcess = await localClient(db).listContainers();
    expect(containersOverHttp).toEqual(containersInProcess);
  });

  it('logs tool calls and writes under the MCP request id', async () => {
    const created = await remote.addInventoryItem({
      name: 'Пузырь',
      kind: 'artifact',
      level: 15,
      qty: 1,
      virtual: false,
      dryRun: false,
    });
    expect(created.dryRun).toBe(false);
    flushLogs(db);

    const { entries } = queryLogs(db, { requestId: 'mcp-http-1', limit: 100 });
    const tool = entries.find((entry) => entry.message === 'mcp call');
    expect(tool).toMatchObject({ level: 'info', category: 'mcp', source: 'mcp' });
    expect(tool?.context).toMatchObject({ tool: 'addInventoryItem', channel: 'mcp' });
    expect(tool?.durationMs).toEqual(expect.any(Number));

    const event = listEvents(db).find(
      (entry) => entry.action === 'inventory.item.create' && entry.request_id === 'mcp-http-1',
    );
    expect(event).toMatchObject({ origin: 'mcp' });
  });

  it('rejects requests without the bearer token', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    flushLogs(db);
    const { entries } = queryLogs(db, { requestId: 'mcp-http-1', limit: 100 });
    expect(entries.some((entry) => entry.message === 'mcp unauthorized' && entry.level === 'warn')).toBe(true);
  });

  it('is disabled with 404 when no token is configured', async () => {
    const disabled = createMcpHttpHandler({ client: localClient(db), token: null });
    const disabledServer = http.createServer((req, res) => {
      void disabled(req, res);
    });
    await new Promise<void>((resolve) => disabledServer.listen(0, '127.0.0.1', resolve));
    const address = disabledServer.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => disabledServer.close(() => resolve()));
    }
  });
});

describe('MCP local sync options', () => {
  it('runs the icons source in the configured directory', async () => {
    const iconsDir = path.join(dir, 'mcp-icons');
    const cacheDir = path.join(dir, 'mcp-cache');
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

    // Any request that escapes the fake fetch would reach the network.
    const globalFetch = vi.fn(async () => {
      throw new Error('network disabled in tests');
    });
    vi.stubGlobal('fetch', globalFetch);
    try {
      const fetchImpl = async (url: string): Promise<Response> => {
        if (url.endsWith('/commits/main')) {
          return json({ sha: 'abc123', commit: { committer: { date: '2026-11-14T10:00:00Z' } } });
        }
        if (url.includes('/git/trees/main')) return json({ tree: [{ path: 'ru/items/weapon/ks-1.json' }] });
        if (url.endsWith('/ru/stats.json')) return json([]);
        if (url.includes('/icons/')) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
        if (url.includes('raw.githubusercontent.com')) {
          return json({
            id: 'ks-1',
            category: 'weapon/shotgun_rifle',
            name: { lines: { ru: 'KS-1', en: 'KS-1' } },
            infoBlocks: [],
          });
        }
        throw new Error(`unexpected url ${url}`);
      };

      const result = await localClient(db, { iconsDir, cacheDir, fetchImpl }).syncSource('icons', false);

      expect(result).toMatchObject({ source: 'icons', status: 'ok', icons: 1 });
      expect(fs.readdirSync(iconsDir)).toEqual([expect.stringMatching(/^[a-f0-9]{40}\.png$/)]);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('MCP virtual inventory', () => {
  it('adds a virtual instance and lists only virtual items', async () => {
    const added = await callTool('add_inventory_item', {
      name: 'Пузырь',
      kind: 'artifact',
      virtual: true,
      dry_run: false,
      confirm: true,
    });
    expect(added.isError).not.toBe(true);
    const diff = (added.structuredContent as { diff?: { after?: { id?: number } } }).diff;
    const id = diff?.after?.id;
    expect(id).toBeTypeOf('number');

    const listed = await callTool('list_inventory_items', { virtual: true });
    const items = (listed.structuredContent as { items: { id: number; virtual: boolean }[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.virtual)).toBe(true);
    expect(items.some((item) => item.id === id)).toBe(true);
  });
});

describe('MCP logging', () => {
  it('reads and clears logs through MCP, with dry_run by default', async () => {
    enqueueLog(db, { level: 'error', category: 'app', message: 'mcp visible', at: new Date().toISOString() });
    flushLogs(db);
    const listed = await callTool('list_logs', { text: 'mcp visible' });
    expect((listed.structuredContent as any).entries).toHaveLength(1);
    const dry = await callTool('clear_logs', { scope: 'all' });
    expect((dry.structuredContent as any).dryRun).toBe(true);
    const applied = await callTool('clear_logs', { scope: 'all', dry_run: false, confirm: true });
    expect((applied.structuredContent as any).dryRun).toBe(false);
  });
});

describe('MCP item detail', () => {
  it('returns only the requested stat levels and the metrics block', async () => {
    const result = await callTool('get_item', { name: 'АК-12', levels: [15] });
    const item = result.structuredContent as {
      item: { stats: { level: number }[]; metrics: { dps: number | null } };
    };
    expect(item.item.stats.every((stat) => stat.level === 15)).toBe(true);
    expect(item.item.metrics.dps).toBe(550);
  });

  it('reports missing compatibility instead of inventing a fit list', async () => {
    const result = await callTool('get_item', { name: 'АК-12', with_modifications: true });
    const item = result.structuredContent as {
      item: { modifications?: { verified: boolean; items: unknown[]; reason?: string } };
    };
    expect(item.item.modifications?.verified).toBe(false);
    expect(item.item.modifications?.items).toEqual([]);
    expect(item.item.modifications?.reason).toBe('NO_COMPAT_DATA');
  });

  it('lists a verified modification after a compatibility edge', async () => {
    seed.replaceExboCompat(db, [
      { modificationItemId: seeded.itemIds.scope!, weaponItemId: seeded.itemIds.rifle! },
    ]);
    const result = await callTool('get_item', {
      id: seeded.itemIds.rifle,
      with_modifications: true,
    });
    const item = result.structuredContent as {
      item: { modifications?: { verified: boolean; items: { name: string }[] } };
    };
    expect(item.item.modifications?.verified).toBe(true);
    expect(item.item.modifications?.items.map((entry) => entry.name)).toContain('Прицел');
  });
});

describe('MCP instance, freshness and tidy', () => {
  it('reads one inventory instance with its children', async () => {
    const result = await callTool('get_inventory_item', { item_id: seeded.instanceIds.backpack });
    const item = result.structuredContent as {
      item: { id: number; artifacts?: { name: string }[]; card?: unknown };
    };
    expect(item.item.id).toBe(seeded.instanceIds.backpack);
    expect(item.item.card).toBeTruthy();
    expect(item.item.artifacts?.map((entry) => entry.name)).toContain('Нервяк');
  });

  it('answers INSTANCE_NOT_FOUND for an unknown instance', async () => {
    const result = await callTool('get_inventory_item', { item_id: 99_999 });
    expect(result.isError).toBe(true);
  });

  it('returns catalog freshness', async () => {
    const result = await callTool('get_meta', {});
    const body = result.structuredContent as { catalogMeta: { items: number } };
    expect(body.catalogMeta.items).toBeGreaterThan(0);
  });

  it('tidies a stash only after confirmation', async () => {
    const preview = await callTool('tidy_storage', {
      storage_id: seeded.storageIds.stash,
      order: 'name',
    });
    expect(preview.isError).not.toBe(true);
    const real = await callTool('tidy_storage', {
      storage_id: seeded.storageIds.stash,
      order: 'name',
      dry_run: false,
      confirm: true,
    });
    expect(real.isError).not.toBe(true);
    expect((real.structuredContent as { dryRun: boolean }).dryRun).toBe(false);
  });
});
