import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, migrate, openDb } from '@profile/core';
import {
  READ_OUTPUT_SCHEMAS,
  READ_TOOLS,
  connectInMemory,
  createProfileServer,
  localClient,
} from '@profile/mcp';
import { seedCatalog } from '../tests/fixtures/seed';

const external = process.env.SMOKE_DB_PATH;
const dir = external ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'profile-smoke-'));
const dbPath = external ?? path.join(dir!, 'smoke.db');

const db = openDb(dbPath);
migrate(db, path.join(process.cwd(), 'db', 'migrations'));
if (!external) seedCatalog(db);

const server = createProfileServer(localClient(db));
const client = await connectInMemory(server);

let failures = 0;

try {
  for (const tool of READ_TOOLS) {
    try {
      const result = await client.callTool({ name: tool.name, arguments: tool.args });
      const content = result.content as { type: string; text?: string }[];
      const text = content.map((entry) => (entry.type === 'text' ? (entry.text ?? '') : '')).join(' ');
      if (result.isError) throw new Error(text || 'tool returned isError');
      const structured = result.structuredContent as Record<string, unknown> | undefined;
      if (!structured) throw new Error('empty structuredContent');
      READ_OUTPUT_SCHEMAS[tool.name].parse(structured);
      console.log(`ok   ${tool.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${tool.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await client.close();
  await server.close();
  closeDb(dbPath);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} read tool(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${READ_TOOLS.length} read tools returned valid output from ${external ? dbPath : 'a seeded temporary database'}`);
