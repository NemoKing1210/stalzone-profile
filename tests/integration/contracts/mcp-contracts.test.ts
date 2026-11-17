import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, migrate, openDb, type Db } from '@dossier/core';
import { localClient } from '@dossier/mcp/client';
import { READ_OUTPUT_SCHEMAS } from '@dossier/shared/contracts';
import { seedCatalog } from '../../fixtures/seed';

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-mcp-contracts-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, migrationsDir);
  seedCatalog(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('MCP read output contracts', () => {
  it('parses every read tool result', async () => {
    const client = localClient(db);
    const outputs: Record<string, unknown> = {
      get_character: await client.getCharacter(),
      find_items: { items: await client.findItems({ limit: 10 }) },
      get_item: { item: await client.getItem({ name: 'АК-12' }) },
      compare_items: { items: await client.compareItems('АК-12', 'KS-1', 15) },
      list_owned: { items: await client.listOwned(null) },
      list_containers: { items: await client.listContainers() },
      plan_artifact_build: { plan: await client.planArtifactBuild({ preset: 'speed', slots: 3 }) },
      get_prices: { prices: await client.getPrices(['АК-12']) },
      sources_status: { sources: await client.sourcesStatus() },
      export_dossier_json: { dossier: await client.exportDossierJson() },
    };

    for (const [tool, output] of Object.entries(outputs)) {
      expect(() => READ_OUTPUT_SCHEMAS[tool]!.parse(output), tool).not.toThrow();
    }
  });
});
