import { defineConfig } from 'vitest/config';
import path from 'node:path';

const r = (p: string) => path.resolve(import.meta.dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      '@dossier/shared': r('packages/shared/src/index.ts'),
      '@dossier/core': r('packages/core/src/index.ts'),
      '@dossier/sources': r('packages/sources/src/index.ts'),
      '@dossier/mcp': r('packages/mcp/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: { reporter: ['text', 'html'] },
  },
});
