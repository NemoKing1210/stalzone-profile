import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export { createProfileServer, READ_TOOLS, READ_OUTPUT_SCHEMAS, writeLimiter } from './registry.js';
export type { WriteLimiter } from './registry.js';
export { localClient, httpClient } from './client.js';
export { instrumentClient } from './logging.js';
export type { ProfileClient, LocalClientOptions } from './client.js';
export { createMcpHttpHandler } from './http.js';

/** Test/smoke helper: connects a fresh SDK client to a server over linked in-memory transports. */
export async function connectInMemory(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'profile-smoke', version: '0.1.0' });
  await client.connect(clientTransport);
  return client;
}
