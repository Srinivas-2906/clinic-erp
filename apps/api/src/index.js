import 'dotenv/config';
import express from 'express';
import { initDatabase } from './db/index.js';
import { corsMiddleware } from './middleware/cors.js';
import platformRouter, { clinicRouter } from './routes/index.js';

initDatabase();

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json());
app.use(corsMiddleware);

// Auth + tenant public info (matches clinic-crm LoginGate paths)
app.use('/api/platform', platformRouter);

// CRM data routes
app.use('/api', clinicRouter());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'clinic-api', docs: 'Standalone backend for clinic-crm' });
});

app.listen(PORT, () => {
  console.log(`
🏥 Clinic API (standalone)
   API:    http://localhost:${PORT}/api
   Health: http://localhost:${PORT}/api/health
   Login:  ajitdentacare@gmail.com / Dentacare@123  (tenant: dentacare)
`);
});
