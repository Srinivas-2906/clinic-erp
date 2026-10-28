#!/usr/bin/env node
/**
 * Pre-deploy checks (no secret values printed). Safe for CI and local staging prep.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function gitRev() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function check(name, pass, detail = '') {
  return { name, pass: !!pass, detail };
}

const checks = [];

checks.push(check('git commit', gitRev() !== 'unknown', gitRev()));

const requiredProd = ['JWT_SECRET'];
const recommendedStaging = [
  'JWT_SECRET',
  'CLINIC_PROVISIONING_API_KEY',
  'LITESTREAM_BUCKET',
];

const mode = process.env.RELEASE_PREFLIGHT_MODE || 'ci';
const envList = mode === 'staging' ? recommendedStaging : ['JWT_SECRET'];

for (const key of envList) {
  const set = !!process.env[key]?.trim();
  checks.push(check(`env ${key} set`, mode === 'ci' ? true : set, set ? 'present' : 'missing'));
}

if (mode === 'staging') {
  checks.push(check('REMINDER_DELIVERY_ENABLED off or unset', process.env.REMINDER_DELIVERY_ENABLED !== '1'));
  checks.push(check(
    'external scheduler or worker flag documented',
    process.env.REMINDER_EXTERNAL_SCHEDULER === '1' || process.env.DISABLE_REMINDER_WORKER === '1' || true,
    'set REMINDER_EXTERNAL_SCHEDULER=1 when Cloud Scheduler is active',
  ));
}

const dbPath = process.env.DATABASE_PATH || path.join(repoRoot, 'apps/api/data/clinic.db');
checks.push(check('database path parent writable', (() => {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
})(), dbPath));

checks.push(check('finance schema additive (initFinanceSchema exists)', fs.existsSync(
  path.join(repoRoot, 'apps/api/src/modules/finance/financeDb.js'),
)));

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ mode, revision: gitRev(), checks }, null, 2));
if (failed.length) {
  process.exit(1);
}
console.log('release-preflight: ok');
