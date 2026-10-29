import express from 'express';
import { jsonBodyParserOptions } from './config/httpBodyLimits.js';
import { jsonBodyErrorHandler } from './middleware/jsonBodyError.js';
import { corsMiddleware } from './middleware/cors.js';
import platformRouter, { clinicRouter } from './routes/index.js';

/** Express app without listen — used by integration tests and production entry. */
export function createApiApp() {
  const app = express();
  app.use(express.json(jsonBodyParserOptions()));
  app.use(jsonBodyErrorHandler);
  app.use(corsMiddleware);
  app.use('/api/platform', platformRouter);
  app.use('/api', clinicRouter());
  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'clinic-api', docs: 'Standalone backend for clinic-crm' });
  });
  app.get('/health', (_req, res) => {
    const payload = { ok: true, service: 'clinic-api' };
    if (process.env.CLINIC_E2E_MODE === '1') {
      const dbPath = process.env.DATABASE_PATH || '';
      payload.e2e = true;
      payload.dbFingerprint = dbPath ? dbPath.replace(/\\/g, '/').split('/').slice(-2).join('/') : 'unknown';
    }
    res.json(payload);
  });
  return app;
}
