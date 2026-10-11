import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/demo-server.mjs',
    url: 'http://127.0.0.1:4178/__apiMock',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
