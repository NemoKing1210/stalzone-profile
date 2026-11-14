import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { server: 'apps/api/src/server.ts' },
    outDir: 'apps/api/dist',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: true,
    external: ['better-sqlite3'],
    tsconfig: 'tsconfig.json',
  },
  {
    entry: { server: 'apps/mcp/src/server.ts' },
    outDir: 'apps/mcp/dist',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: true,
    external: ['better-sqlite3'],
    tsconfig: 'tsconfig.json',
  },
]);
