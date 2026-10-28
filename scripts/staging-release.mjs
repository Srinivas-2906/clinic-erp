#!/usr/bin/env node
/**
 * Staging release checklist runner — does not deploy or merge.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function rev() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const checkOnly = process.argv.includes('--check-only');

console.log(JSON.stringify({
  step: 'staging-release-prep',
  revision: rev(),
  branch: execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim(),
  prSequence: ['Merge PR #24', 'Rebase PR #25 → main', 'Merge PR #25', 'cloudbuild.staging.yaml', 'staging-validate.mjs'],
  approvalRequired: ['merge', 'deploy', 'REMINDER_DELIVERY_ENABLED', 'Cloud Scheduler', 'real email provider'],
}, null, 2));

if (checkOnly) {
  try {
    execSync('node apps/api/scripts/release-preflight.js', { cwd: root, stdio: 'inherit', env: { ...process.env, RELEASE_PREFLIGHT_MODE: 'ci' } });
    execSync('node apps/api/scripts/billing-api-smoke.js', { cwd: root, stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
  console.log('Local release checks passed. Run scripts/staging-validate.mjs against staging URLs after deploy.');
}
