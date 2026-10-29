import 'dotenv/config';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db/index.js';
import { createApiApp } from './appFactory.js';
import { initReminderInfrastructure, processDueReminders } from './services/reminders/index.js';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));

initDatabase();

if (process.env.CLINIC_E2E_MODE === '1') {
  execSync('node scripts/seed-e2e-local.js', {
    cwd: path.join(apiRoot, '..'),
    stdio: 'inherit',
    env: process.env,
  });
}

initReminderInfrastructure();

const REMINDER_POLL_MS = Number(process.env.REMINDER_POLL_MS || 30_000);
const useInProcessReminderWorker = process.env.DISABLE_REMINDER_WORKER !== '1'
  && process.env.REMINDER_EXTERNAL_SCHEDULER !== '1';
if (useInProcessReminderWorker) {
  setInterval(() => {
    try {
      processDueReminders();
    } catch (err) {
      console.error('[reminder-worker]', err.message || err);
    }
  }, REMINDER_POLL_MS).unref?.();
}

const app = createApiApp();
const PORT = process.env.PORT || 3010;

app.listen(PORT, () => {
  console.log(`Clinic API listening on port ${PORT}`);
});
