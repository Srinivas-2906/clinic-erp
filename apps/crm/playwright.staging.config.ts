import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.E2E_BASE_URL || 'https://kaana-clinic-staging-339065153036.asia-south1.run.app';
const TENANT = process.env.E2E_TENANT || 'dentacare';
process.env.E2E_API_URL = process.env.E2E_API_URL || 'https://clinic-api-staging-339065153036.asia-south1.run.app';

/** Playwright against deployed staging — no local webServer. */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['21-staging-pilot-journey.spec.ts', '01-auth.spec.ts', '12-logout.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: 'e2e/report/staging-results.json' }]],
  outputDir: 'e2e/test-results-staging',
  globalSetup: path.join(__dirname, 'e2e/global-setup.ts'),
  use: {
    baseURL: `${BASE_URL}?tenant=${TENANT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'staging-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'staging-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
