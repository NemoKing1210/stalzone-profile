#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getLogger, initLogging, shutdownLogging, type Db, type Logger } from '@profile/core';
import { loadConfig } from '@profile/core/config';
import { openDb } from '@profile/core/db';
import { migrate } from '@profile/core/db/migrate';
import { httpClient, localClient, type ProfileClient } from './client.js';
import { createProfileServer } from './registry.js';

const apiUrl = process.env.PROFILE_API_URL?.trim();
const token = (process.env.MCP_TOKEN ?? process.env.NUXT_MCP_TOKEN ?? '').trim();

let client: ProfileClient;
let db: Db | null = null;
let logger: Logger | null = null;

if (apiUrl) {
  if (!token) {
    console.error('[mcp] PROFILE_API_URL is set but MCP_TOKEN is empty; /mcp will reject the shim');
  }
  client = httpClient(apiUrl, token);
} else {
  const cfg = loadConfig();
  db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  initLogging(db, { source: 'mcp', processHooks: true });
  logger = getLogger(db, 'mcp', { source: 'mcp' });
  client = localClient(db, {
    iconsDir: cfg.iconsDir,
    profileApi:
      cfg.stalzoneClientId && cfg.stalzoneClientSecret
        ? {
            clientId: cfg.stalzoneClientId,
            clientSecret: cfg.stalzoneClientSecret,
            apiUrl: cfg.stalzoneApiUrl,
            tokenUrl: cfg.stalzoneTokenUrl,
          }
        : undefined,
  });
}

const server = createProfileServer(client, logger ? { logger } : {});
const transport = new StdioServerTransport();

await server.connect(transport);
console.error(`[mcp] stalzone-profile ready (${apiUrl ? `http ${apiUrl}` : 'local database'})`);

async function shutdown(): Promise<void> {
  await client.close?.();
  await server.close();
  if (db) shutdownLogging(db);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
