import 'dotenv/config';
import express from 'express';
import { initDatabase } from './db/index.js';
import { jsonBodyParserOptions } from './config/httpBodyLimits.js';
import { jsonBodyErrorHandler } from './middleware/jsonBodyError.js';
import { corsMiddleware } from './middleware/cors.js';
import platformRouter, { clinicRouter } from './routes/index.js';
import { initReminderInfrastructure, processDueReminders } from './services/reminders/index.js';

initDatabase();
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

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json(jsonBodyParserOptions()));
app.use(jsonBodyErrorHandler);
app.use(corsMiddleware);

// Auth + tenant public info (matches clinic-crm LoginGate paths)
app.use('/api/platform', platformRouter);

// CRM data routes
app.use('/api', clinicRouter());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'clinic-api', docs: 'Standalone backend for clinic-crm' });
});

app.listen(PORT, () => {
  console.log(`Clinic API listening on port ${PORT}`);
});
