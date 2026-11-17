import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeMiddleware } from 'h3';
import { getLogger } from '@profile/core';
import { createMcpHttpHandler, localClient, writeLimiter } from '@profile/mcp';
import { mcpToken } from '../utils/auth';
import { useDb } from '../utils/db';
import { serverSyncOptions } from '../utils/sync-options';

// Shared across requests so the 30-writes-per-minute budget cannot be reset by a new transport.
const limiter = writeLimiter(30);

export default fromNodeMiddleware(async (req: IncomingMessage, res: ServerResponse) => {
  const token = mcpToken();
  // Without a token the surface does not exist; do not open or migrate the DB.
  if (!token) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const db = useDb();
  const handler = createMcpHttpHandler({
    client: localClient(db, serverSyncOptions()),
    token,
    limiter,
    logger: getLogger(db, 'mcp', { source: 'mcp' }),
  });
  await handler(req, res);
});
