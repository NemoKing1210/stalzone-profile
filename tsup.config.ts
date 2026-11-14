import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'scripts/cli.ts',
    'mcp-stdio': 'packages/mcp/src/stdio.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['better-sqlite3'],
  tsconfig: 'tsconfig.node.json',
});
