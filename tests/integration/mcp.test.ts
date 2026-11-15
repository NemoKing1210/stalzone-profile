import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { closeDb, loadConfig, migrate, openDb, type Db } from '@dossier/core';
import { importLegacy } from '@dossier/core/services/import';
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

let dir: string;
let db: Db;
let server: ReturnType<typeof createDossierServer>;
let client: Client;

const ALL_TOOLS = [
  'compare_items',
  'delete_build',
  'export_legacy_json',
  'find_items',
  'get_build',
  'get_character',
  'get_item',
  'get_prices',
  'list_builds',
  'list_containers',
  'list_owned',
  'plan_artifact_build',
  'rebuild_site',
  'remove_owned_item',
  'rollback_event',
  'save_build',
  'set_container_artifacts',
  'sources_status',
  'sync_source',
  'upsert_content_block',
  'upsert_owned_item',
];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-mcp-'));
  const cfg = loadConfig({
    dbPath: path.join(dir, 'test.db'),
    seedsDir: path.join(process.cwd(), 'db', 'seeds'),
    iconsDir: path.join(dir, 'icons'),
  });
  db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  importLegacy(db, cfg);
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
  it('publishes all dossier tools and the schema resource', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(ALL_TOOLS);

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain('dossier://schema');
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

  it('finds item stats and compares DPS/TTK', async () => {
    const item = await callTool('get_item', { name: 'KS-1' });
    const detail = item.structuredContent as {
      item: { name: string; icon: string | null; stats: unknown[] };
    };
    expect(detail.item.name).toBe('KS-1');
    expect(detail.item.stats.length).toBeGreaterThan(0);
    expect(detail.item.icon).toBeTruthy();

    const compared = await callTool('compare_items', { a: 'АК-12', b: 'HK416', level: 15 });
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
    const clientApi = localClient(db);

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
    expect(
      JSON.parse((unconfirmed.content as { text: string }[])[0].text),
    ).toMatchObject({
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

    const owned = await clientApi.listOwned('artifact');
    const copies = owned.reduce((sum, row) => sum + Number(row.qty ?? 1), 0);
    expect(copies).toBe(22);
  });

  it('runs a source sync through the MCP tool', async () => {
    const result = await callTool('sync_source', {
      source: 'profile',
      force: false,
      confirm: true,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      result: { source: 'profile', status: 'ok', items: 1 },
    });
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
      expect(
        JSON.parse((result.content as { text: string }[])[0].text),
      ).toMatchObject({
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
  let handler: ReturnType<typeof createMcpHttpHandler>;

  beforeAll(async () => {
    handler = createMcpHttpHandler({
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
    const overHttp = await remote.getItem({ name: 'KS-1' });
    const inProcess = await localClient(db).getItem({ name: 'KS-1' });
    expect(overHttp).toEqual(inProcess);

    const buildsOverHttp = await remote.listBuilds();
    const buildsInProcess = await localClient(db).listBuilds();
    expect(buildsOverHttp).toEqual(buildsInProcess);
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
