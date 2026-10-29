#!/usr/bin/env node
/**
 * Refuse seeding or destructive E2E ops against dev/prod databases.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');
const defaultDevDb = path.join(repoRoot, 'apps/api/data/clinic.db');
const prodProject = 'crucial-accord-505607-g9';

const dbPath = path.resolve(process.env.DATABASE_PATH || defaultDevDb);
const normalized = dbPath.replace(/\\/g, '/');

const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
if (nodeEnv === 'production' || nodeEnv === 'staging') {
  console.error(`Refusing E2E: NODE_ENV=${process.env.NODE_ENV}`);
  process.exit(1);
}

if (process.env.CLINIC_ENV === 'production' || process.env.CLINIC_ENV === 'staging') {
  console.error(`Refusing E2E: CLINIC_ENV=${process.env.CLINIC_ENV}`);
  process.exit(1);
}

if (process.env.GCP_PROJECT === prodProject || process.env.GOOGLE_CLOUD_PROJECT === prodProject) {
  console.error('Refusing E2E: production GCP project');
  process.exit(1);
}

const isE2ePath = /\/data\/e2e\//.test(normalized) || normalized.includes('/tmp/') || normalized.includes('e2e-');
const allowDev = process.env.E2E_ALLOW_DEV_DATABASE === '1';

if (!isE2ePath && !allowDev) {
  console.error(
    `Refusing E2E seed on non-isolated DATABASE_PATH:\n  ${dbPath}\n` +
      `Use apps/api/data/e2e/clinic.db or set E2E_ALLOW_DEV_DATABASE=1 intentionally.`,
  );
  process.exit(1);
}

if (normalized === path.resolve(defaultDevDb) && !allowDev) {
  console.error('Refusing to seed default dev clinic.db without E2E_ALLOW_DEV_DATABASE=1');
  process.exit(1);
}

console.log(JSON.stringify({ e2eDatabaseSafe: true, databasePath: dbPath }));
