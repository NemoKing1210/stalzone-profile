import { loadConfig } from '@dossier/core/config';
import { openDb } from '@dossier/core/db';
import { migrate } from '@dossier/core/db/migrate';
import {
  READ_OUTPUT_SCHEMAS,
  READ_TOOLS,
  connectInMemory,
  createDossierServer,
  localClient,
} from '@dossier/mcp';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
migrate(db, cfg.migrationsDir);

const server = createDossierServer(localClient(db));
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
}

if (failures) {
  console.error(`\n${failures} read tool(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${READ_TOOLS.length} read tools returned valid output from ${cfg.dbPath}`);
