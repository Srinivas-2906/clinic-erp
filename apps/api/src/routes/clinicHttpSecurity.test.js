/**
 * HTTP-level auth, tenant isolation, and validation for clinic settings,
 * reports, and access-request management routes.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-http-sec-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'clinic-http-security-secret';
process.env.CLINIC_FILES_STORAGE = 'memory';

const { initDatabase, getDb } = await import('../db/index.js');
const { signToken } = await import('../middleware/auth.js');
const { jsonBodyParserOptions } = await import('../config/httpBodyLimits.js');
const { jsonBodyErrorHandler } = await import('../middleware/jsonBodyError.js');
const { clinicRouter } = await import('../routes/index.js');

const tenantA = 'tenant-http-a';
const tenantB = 'tenant-http-b';
const slugA = 'clinic-a';
const slugB = 'clinic-b';

let ownerA;
let receptionistA;
let doctorA;
let ownerB;
let accessRequestA;
let accessRequestB;

before(() => {
  initDatabase();
  const db = getDb();
  const settings = JSON.stringify({ timezone: 'Asia/Kolkata', phone: '111' });
  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, subscription_status, settings)
    VALUES (?, ?, 'Clinic A', 'clinic', 'growth', 'active', 'active', ?)
  `).run(tenantA, slugA, settings);
  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, subscription_status, settings)
    VALUES (?, ?, 'Clinic B', 'clinic', 'growth', 'active', 'active', '{}')
  `).run(tenantB, slugB);

  const hash = bcrypt.hashSync('pass', 4);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('own-a', ?, 'own-a@test', ?, 'Owner A', 'owner')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('recv-a', ?, 'recv-a@test', ?, 'Recv A', 'receptionist')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('doc-a', ?, 'doc-a@test', ?, 'Doc A', 'doctor')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('own-b', ?, 'own-b@test', ?, 'Owner B', 'owner')`).run(tenantB, hash);

  ownerA = signToken({ id: 'own-a', email: 'own-a@test', role: 'owner', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  receptionistA = signToken({ id: 'recv-a', email: 'recv-a@test', role: 'receptionist', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  doctorA = signToken({ id: 'doc-a', email: 'doc-a@test', role: 'doctor', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  ownerB = signToken({ id: 'own-b', email: 'own-b@test', role: 'owner', tenant_id: tenantB, is_platform_admin: 0 }, { id: tenantB });

  accessRequestA = 'req-a-1';
  accessRequestB = 'req-b-1';
  db.prepare(`
    INSERT INTO access_requests (id, tenant_id, email, name, status)
    VALUES (?, ?, 'newstaff-a@test', 'New Staff A', 'pending')
  `).run(accessRequestA, tenantA);
  db.prepare(`
    INSERT INTO access_requests (id, tenant_id, email, name, status)
    VALUES (?, ?, 'newstaff-b@test', 'New Staff B', 'pending')
  `).run(accessRequestB, tenantB);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createApp() {
  const app = express();
  app.use(express.json(jsonBodyParserOptions()));
  app.use(jsonBodyErrorHandler);
  app.use('/api', clinicRouter());
  return app;
}

async function request(app, method, url, { token, body, headers = {} } = {}) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('clinic settings HTTP', () => {
  it('GET /clinic/settings rejects unauthenticated requests', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/settings');
    assert.equal(res.status, 401);
  });

  it('GET /clinic/settings returns tenant settings for authorized staff', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/settings', { token: receptionistA });
    assert.equal(res.status, 200);
    assert.equal(res.json.tenantId, tenantA);
    assert.equal(res.json.settings.phone, '111');
  });

  it('PATCH /clinic/settings rejects receptionist role', async () => {
    const app = createApp();
    const res = await request(app, 'PATCH', '/api/clinic/settings', {
      token: receptionistA,
      body: { phone: '999' },
    });
    assert.equal(res.status, 403);
    assert.match(String(res.json.error), /owner/i);
  });

  it('PATCH /clinic/settings allows owner and persists allowed fields', async () => {
    const app = createApp();
    const res = await request(app, 'PATCH', '/api/clinic/settings', {
      token: ownerA,
      body: { phone: '222', website: 'https://a.example' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.phone, '222');
    assert.equal(res.json.settings.website, 'https://a.example');
  });

  it('PATCH /clinic/settings ignores unknown keys without error', async () => {
    const app = createApp();
    const res = await request(app, 'PATCH', '/api/clinic/settings', {
      token: ownerA,
      body: { evilKey: 'x', phone: '333' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.phone, '333');
    assert.equal(res.json.settings.evilKey, undefined);
  });
});

describe('clinic report HTTP', () => {
  it('GET /clinic/report rejects unauthenticated requests', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/report?from=2026-01-01&to=2026-01-31');
    assert.equal(res.status, 401);
  });

  it('GET /clinic/report returns scoped data for tenant member', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/report?from=2026-01-01&to=2026-01-31', {
      token: receptionistA,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.from, '2026-01-01');
    assert.equal(res.json.to, '2026-01-31');
    assert.ok(Array.isArray(res.json.appointments));
    assert.ok(Array.isArray(res.json.payments));
  });

  it('GET /clinic/report does not leak another tenant rows when token is tenant A', async () => {
    const db = getDb();
    const patientB = 'pat-b-1';
    db.prepare(`
      INSERT INTO patients (id, tenant_id, name, phone, phone_digits)
      VALUES (?, ?, 'Secret B', '9000000001', '9000000001')
    `).run(patientB, tenantB);
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, patient_id, service, scheduled_at, status)
      VALUES ('appt-b-1', ?, ?, 'Consult', datetime('now'), 'confirmed')
    `).run(tenantB, patientB);

    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/report?from=2020-01-01&to=2030-12-31', {
      token: ownerA,
    });
    assert.equal(res.status, 200);
    const names = (res.json.appointments || []).map((a) => a.patientName || a.patient?.name);
    assert.ok(!names.includes('Secret B'));
  });

  it('GET /clinic/report allows doctor role (tenant-scoped)', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/report', { token: doctorA });
    assert.equal(res.status, 200);
  });
});

describe('clinic access-requests HTTP', () => {
  it('GET /clinic/access-requests rejects unauthenticated requests', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/access-requests');
    assert.equal(res.status, 401);
  });

  it('GET /clinic/access-requests rejects non-owner staff', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/access-requests', { token: receptionistA });
    assert.equal(res.status, 403);
  });

  it('GET /clinic/access-requests lists only own tenant pending rows for owner', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/access-requests?status=pending', { token: ownerA });
    assert.equal(res.status, 200);
    const emails = (res.json.requests || []).map((r) => r.email);
    assert.ok(emails.includes('newstaff-a@test'));
    assert.ok(!emails.includes('newstaff-b@test'));
  });

  it('POST approve rejects cross-tenant request id', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/access-requests/${accessRequestB}/approve`, {
      token: ownerA,
      body: { role: 'receptionist' },
    });
    assert.ok(res.status === 400 || res.status === 404);
  });

  it('POST reject rejects cross-tenant request id', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/access-requests/${accessRequestB}/reject`, {
      token: ownerA,
      body: { note: 'no' },
    });
    assert.ok(res.status === 400 || res.status === 404);
  });

  it('POST approve succeeds for owner on own tenant request', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/access-requests/${accessRequestA}/approve`, {
      token: ownerA,
      body: { role: 'receptionist' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.user?.email === 'newstaff-a@test' || res.json.request?.status === 'approved');
  });
});
