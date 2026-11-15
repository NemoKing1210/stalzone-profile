import { defineConfig } from 'vitest/config';
import path from 'node:path';

const r = (p: string) => path.resolve(import.meta.dirname, p);

const workspace = (name: string, dir: string) => [
  { find: new RegExp(`^@dossier/${name}$`), replacement: r(`packages/${dir}/src/index.ts`) },
  { find: new RegExp(`^@dossier/${name}/(.*)$`), replacement: r(`packages/${dir}/src/$1`) },
];

export default defineConfig({
  resolve: {
    alias: [
      ...workspace('shared', 'shared'),
      ...workspace('core', 'core'),
      ...workspace('sources', 'sources'),
      ...workspace('mcp', 'mcp'),
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: { reporter: ['text', 'html'] },
  },
});
