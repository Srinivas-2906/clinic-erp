import express from 'express';
import { jsonBodyParserOptions } from './config/httpBodyLimits.js';
import { jsonBodyErrorHandler } from './middleware/jsonBodyError.js';
import { corsMiddleware } from './middleware/cors.js';
import { writerLeaseGuardMiddleware } from './middleware/writerLeaseGuard.js';
import platformRouter, { clinicRouter } from './routes/index.js';
import { billingWebhookRouter } from './routes/billingWebhook.routes.js';

/** Express app without listen — used by integration tests and production entry. */
export function createApiApp() {
  const app = express();
  app.use('/api/platform/webhooks', billingWebhookRouter());
  app.use(express.json(jsonBodyParserOptions()));
  app.use(jsonBodyErrorHandler);
  app.use(corsMiddleware);
  app.use(writerLeaseGuardMiddleware());
  app.use('/api/platform', platformRouter);
  app.use('/api', clinicRouter());
  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'clinic-api', docs: 'Standalone backend for clinic-crm' });
  });
  app.get('/health', (_req, res) => {
    const leaseRequired =
      process.env.CLINIC_WRITER_LEASE_REQUIRED === '1'
      || (process.env.LITESTREAM_BUCKET && process.env.NODE_ENV === 'production'
        && process.env.CLINIC_WRITER_LEASE_REQUIRED !== '0');
    if (leaseRequired && process.env.CLINIC_WRITER_LEASE_HELD !== '1') {
      return res.status(503).json({
        ok: false,
        service: 'clinic-api',
        reason: 'writer-lease-not-held',
      });
    }
    const payload = { ok: true, service: 'clinic-api' };
    if (process.env.CLINIC_WRITER_LEASE_HELD === '1') {
      payload.writerLease = {
        held: true,
        holder: process.env.CLINIC_WRITER_LEASE_HOLDER || null,
        fence: process.env.CLINIC_WRITER_LEASE_FENCE || null,
      };
    }
    if (process.env.CLINIC_E2E_MODE === '1') {
      const dbPath = process.env.DATABASE_PATH || '';
      payload.e2e = true;
      payload.dbFingerprint = dbPath ? dbPath.replace(/\\/g, '/').split('/').slice(-2).join('/') : 'unknown';
    }
    res.json(payload);
  });
  return app;
}
