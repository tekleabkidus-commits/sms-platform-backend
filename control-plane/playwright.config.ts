import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: true,
  },
  webServer: [
    {
      command: 'node e2e/mock-backend.mjs',
      port: 4010,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 3001',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        BACKEND_BASE_URL: 'http://127.0.0.1:4010/api/v1',
        NEXT_PUBLIC_BACKEND_SWAGGER_URL: 'http://127.0.0.1:4010/api/v1/docs',
        NEXT_PUBLIC_APP_ENV: 'test',
      },
    },
  ],
});
