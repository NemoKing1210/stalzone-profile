import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ORIGIN = 'http://127.0.0.1:3100';
const TOKEN = 'e2e-mcp-token';

test.describe.configure({ mode: 'serial' });

test('MCP endpoint lists tools and returns dossier data over HTTP', async () => {
  const client = new Client({ name: 'dossier-e2e', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
  });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain('get_item');
    expect(tools.tools.map((tool) => tool.name)).toContain('upsert_owned_item');

    const item = await client.callTool({ name: 'get_item', arguments: { name: 'KS-1' } });
    expect(item.isError).not.toBe(true);
    const detail = item.structuredContent as {
      item: { name: string; icon: string | null };
    };
    expect(detail.item.name).toBe('KS-1');
    expect(detail.item.icon).toBeTruthy();

    const dryRun = await client.callTool({
      name: 'upsert_owned_item',
      arguments: { name: 'Нервяк', kind: 'artifact', level: 15 },
    });
    expect(dryRun.structuredContent).toMatchObject({ dryRun: true });
  } finally {
    await client.close();
  }
});

test('MCP endpoint rejects requests without the bearer token', async ({ request }) => {
  const response = await request.post('/mcp', {
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
});
