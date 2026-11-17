#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { migrate } from '@dossier/core/db/migrate';
import { httpClient, localClient, type DossierClient } from './client.js';
import { createDossierServer } from './registry.js';

const apiUrl = process.env.DOSSIER_API_URL?.trim();
const token = (process.env.MCP_TOKEN ?? process.env.NUXT_MCP_TOKEN ?? '').trim();

let client: DossierClient;

if (apiUrl) {
  if (!token) {
    console.error('[mcp] DOSSIER_API_URL is set but MCP_TOKEN is empty; /mcp will reject the shim');
  }
  client = httpClient(apiUrl, token);
} else {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
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

const server = createDossierServer(client);
const transport = new StdioServerTransport();

await server.connect(transport);
console.error(`[mcp] stalzone-profile ready (${apiUrl ? `http ${apiUrl}` : 'local database'})`);

async function shutdown(): Promise<void> {
  await client.close?.();
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
