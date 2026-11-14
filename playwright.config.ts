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
        command: 'npm run build && tsx tests/e2e/serve.ts',
        url: 'http://127.0.0.1:3100/api/v1/healthz',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
