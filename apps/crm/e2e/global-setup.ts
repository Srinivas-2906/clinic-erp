import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, '../../api');
const screenshotDir = path.join(__dirname, 'screenshots');
const reportDir = path.join(__dirname, 'report');

export default async function globalSetup() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });

  console.log('\n[e2e] Seeding E2E test credentials…');
  execSync('node scripts/seed-e2e-user.js', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
}
