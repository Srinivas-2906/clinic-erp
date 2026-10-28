import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, '../../api');
const repoRoot = path.join(__dirname, '../../..');
const e2eDbPath =
  process.env.DATABASE_PATH || path.join(repoRoot, 'apps/api/data/e2e/clinic.db');
const screenshotDir = path.join(__dirname, 'screenshots');
const reportDir = path.join(__dirname, 'report');

export default async function globalSetup() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });

  if (process.env.E2E_STAGING === '1') {
    console.log('\n[e2e] Staging target — skipping local API seed.');
    return;
  }

  if (process.env.E2E_RESET_DB !== '0') {
    execSync('node scripts/reset-e2e-database.js', {
      cwd: apiRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_PATH: e2eDbPath },
    });
  }

  const seedScript = process.env.E2E_SEED_SCRIPT || 'scripts/seed-e2e-local.js';
  console.log(`\n[e2e] Seeding fixtures (${seedScript}) on ${e2eDbPath}…`);
  execSync(`node ${seedScript}`, {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_PATH: e2eDbPath },
  });
}
