import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && node .output/server/index.mjs',
        url: 'http://127.0.0.1:3100/',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          PORT: '3100',
          HOST: '127.0.0.1',
          NUXT_SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
          NUXT_PASSWORD: 'e2e-password',
          NUXT_DB_PATH: './data/e2e.db',
          NUXT_MCP_TOKEN: 'e2e-mcp-token',
        },
      },
});
