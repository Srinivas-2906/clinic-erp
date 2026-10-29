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

  if (process.env.E2E_REUSE_SERVERS === '1') {
    try {
      const res = await fetch('http://localhost:3010/api/health');
      const body = await res.json() as { e2e?: boolean; dbFingerprint?: string };
      if (!body.e2e || !String(body.dbFingerprint || '').includes('e2e/')) {
        throw new Error(
          `E2E_REUSE_SERVERS=1 but API is not on isolated e2e DB (health=${JSON.stringify(body)}). Stop dev servers or unset E2E_REUSE_SERVERS.`,
        );
      }
      console.log('[e2e] Reusing servers with fingerprint', body.dbFingerprint);
    } catch (err) {
      console.error(String(err));
      process.exit(1);
    }
  }

  if (process.env.E2E_RESET_DB !== '0') {
    execSync('node scripts/reset-e2e-database.js', {
      cwd: apiRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_PATH: e2eDbPath },
    });
  }

  console.log('\n[e2e] Fixtures seed runs via API webServer (seed-e2e-local.js before dev).');
}
