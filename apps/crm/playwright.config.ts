import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5185';
const TENANT = process.env.E2E_TENANT || 'dentacare';
const SCREENSHOT_DIR = path.join(__dirname, 'e2e', 'screenshots');
const VISUAL_SLOW_MO = Number(process.env.E2E_SLOW_MO ?? 300);
const E2E_DB =
  process.env.DATABASE_PATH || path.join(repoRoot, 'apps/api/data/e2e/clinic.db');

const apiEnv = {
  ...process.env,
  DATABASE_PATH: E2E_DB,
  CLINIC_FILES_STORAGE: 'memory',
  CLINIC_FILES_PREFIX: 'clinic-files-e2e',
  DISABLE_REMINDER_WORKER: '1',
};

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  grep: process.env.E2E_GREP ? new RegExp(process.env.E2E_GREP) : undefined,
  testIgnore: ['**/21-staging-pilot-journey.spec.ts'],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/report', open: process.env.PW_OPEN_REPORT === '1' ? 'always' : 'never' }],
    ['json', { outputFile: 'e2e/report/results.json' }],
  ],
  outputDir: 'e2e/test-results',
  globalSetup: path.join(__dirname, 'e2e/global-setup.ts'),
  use: {
    baseURL: `${BASE_URL}?tenant=${TENANT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.E2E_VIDEO === '1' ? 'on' : 'off',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'chrome-visual',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: { slowMo: VISUAL_SLOW_MO },
        video: 'on',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: path.join(__dirname, '../api'),
      url: 'http://localhost:3010/api/health',
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === '1',
      timeout: 120_000,
      env: apiEnv,
    },
    {
      command: 'npm run dev',
      cwd: __dirname,
      url: 'http://localhost:5185',
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === '1',
      timeout: 120_000,
    },
  ],
});

export { SCREENSHOT_DIR, BASE_URL, TENANT };
