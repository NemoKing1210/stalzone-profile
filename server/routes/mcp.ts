import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeMiddleware } from 'h3';
import { getLogger } from '@profile/core';
import { createMcpHttpHandler, localClient, writeLimiter } from '@profile/mcp';
import { useDb } from '../utils/db';
import { serverSyncOptions } from '../utils/sync-options';

// Shared across requests so the 30-writes-per-minute budget cannot be reset by a new transport.
const limiter = writeLimiter(30);

export default fromNodeMiddleware(async (req: IncomingMessage, res: ServerResponse) => {
  const token = String(useRuntimeConfig().mcpToken ?? '').trim();
  const db = useDb();
  const handler = createMcpHttpHandler({
    client: localClient(db, serverSyncOptions()),
    token: token || null,
    limiter,
    logger: getLogger(db, 'mcp', { source: 'mcp' }),
  });
  await handler(req, res);
});
