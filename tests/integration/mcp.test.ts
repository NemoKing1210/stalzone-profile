import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { closeDb, migrate, openDb, runExclusive, type Db } from '@dossier/core';
import {
  READ_OUTPUT_SCHEMAS,
  READ_TOOLS,
  connectInMemory,
  createDossierServer,
  createMcpHttpHandler,
  httpClient,
  localClient,
  writeLimiter,
} from '@dossier/mcp';
import { seedCatalog } from '../fixtures/seed';

let dir: string;
let db: Db;
let server: ReturnType<typeof createDossierServer>;
let client: Client;

const EXPECTED_WRITE_TOOLS = [
  'upsert_owned_item',
  'remove_owned_item',
  'set_container_artifacts',
  'sync_source',
  'rebuild_site',
  'rollback_event',
];
const EXPECTED_READ_TOOLS = [
  'get_character',
  'find_items',
  'get_item',
  'compare_items',
  'list_owned',
  'list_containers',
  'plan_artifact_build',
  'get_prices',
  'sources_status',
  'export_dossier_json',
];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-mcp-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  seedCatalog(db);
  server = createDossierServer(localClient(db));
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

async function nervyakQty(): Promise<number> {
  const rows = await localClient(db).listOwned('artifact');
  return Number(rows.find((row) => row.name === 'Нервяк')?.qty ?? 0);
}

describe('MCP registry', () => {
  it('registers the new tool list and no content writer', async () => {
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools.sort()).toEqual([...EXPECTED_READ_TOOLS, ...EXPECTED_WRITE_TOOLS].sort());
    expect(tools).not.toContain('upsert_content_block');
    expect(tools).not.toContain('export_legacy_json');

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain('dossier://schema');
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

  it('exports the typed dossier', async () => {
    const result = await callTool('export_dossier_json', {});
    const dossier = (result.structuredContent as { dossier: Record<string, any> }).dossier;
    expect(dossier).not.toHaveProperty('career');
    expect(dossier.weapons[0]).not.toHaveProperty('raw');
  });

  it('returns a derived item card', async () => {
    const result = await callTool('get_item', { name: 'АК-12' });
    const item = (result.structuredContent as { item: { card: { p15: { d0: number } }; stats: any[] } }).item;
    expect(item.card.p15.d0).toBe(55);
    expect(item.stats[0]).toHaveProperty('stat_id');
  });

  it('compares DPS/TTK from typed stats', async () => {
    const compared = await callTool('compare_items', { a: 'АК-12', b: 'KS-1', level: 15 });
    const items = (compared.structuredContent as { items: { found: boolean; dps: number; ttk: number }[] })
      .items;
    expect(items.map((row) => row.found)).toEqual([true, true]);
    for (const row of items) {
      expect(typeof row.dps).toBe('number');
      expect(typeof row.ttk).toBe('number');
    }
  });
});

describe('MCP write safety', () => {
  it('defaults to dry_run and requires confirm for a real write', async () => {
    const before = await nervyakQty();

    const dry = await callTool('upsert_owned_item', { name: 'Нервяк', kind: 'artifact', level: 15 });
    expect(dry.isError).not.toBe(true);
    expect(dry.structuredContent).toMatchObject({ dryRun: true });
    expect(await nervyakQty()).toBe(before);

    const unconfirmed = await callTool('upsert_owned_item', {
      name: 'Нервяк',
      kind: 'artifact',
      level: 15,
      dry_run: false,
    });
    expect(unconfirmed.isError).toBe(true);
    expect(JSON.parse((unconfirmed.content as { text: string }[])[0].text)).toMatchObject({
      error: { code: 'CONFIRM_REQUIRED' },
    });
    expect(await nervyakQty()).toBe(before);

    const applied = await callTool('upsert_owned_item', {
      name: 'Нервяк',
      kind: 'artifact',
      level: 15,
      dry_run: false,
      confirm: true,
    });
    const body = applied.structuredContent as { dryRun: boolean; eventId: number };
    expect(body.dryRun).toBe(false);
    expect(typeof body.eventId).toBe('number');
    expect(await nervyakQty()).toBe(before + 1);

    const restored = await callTool('rollback_event', {
      event_id: body.eventId,
      dry_run: false,
      confirm: true,
    });
    expect(restored.isError).not.toBe(true);
    expect(await nervyakQty()).toBe(before);
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
    const limited = createDossierServer(localClient(db), { limiter: { take: () => false } });
    const limitedClient = await connectInMemory(limited);
    try {
      const result = await limitedClient.callTool({
        name: 'upsert_owned_item',
        arguments: { name: 'Нервяк', kind: 'artifact', level: 15, dry_run: false, confirm: true },
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

  it('rejects requests without the bearer token', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
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
