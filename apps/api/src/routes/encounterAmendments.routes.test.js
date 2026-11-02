import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-amend-routes-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-amend-routes';
process.env.CLINIC_FILES_STORAGE = 'memory';

const { initDatabase, getDb } = await import('../db/index.js');
const { signToken } = await import('../middleware/auth.js');
const {
  createMemoryUploadStorage,
  setUploadStorageBackendForTests,
  resetUploadStorageBackendForTests,
} = await import('../services/uploadStorage.js');
const { jsonBodyParserOptions } = await import('../config/httpBodyLimits.js');
const { jsonBodyErrorHandler } = await import('../middleware/jsonBodyError.js');
const { clinicRouter } = await import('./index.js');
const {
  createEncounter,
  updateEncounterDraft,
  finalizeEncounter,
} = await import('../modules/clinical/encounters.service.js');

const tenantA = 'tenant-amend-a';
const tenantB = 'tenant-amend-b';
let tokenClinicianA;
let tokenClinicianB;
let tokenOwnerB;
let patientA;
let doctorA;
let encounterA;

before(async () => {
  setUploadStorageBackendForTests(createMemoryUploadStorage());
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, industry, plan, status, settings) VALUES (?, 'aa', 'A', 'clinic', 'growth', 'active', '{}')`).run(tenantA);
  db.prepare(`INSERT INTO tenants (id, slug, name, industry, plan, status, settings) VALUES (?, 'ab', 'B', 'clinic', 'growth', 'active', '{}')`).run(tenantB);
  const hash = bcrypt.hashSync('x', 4);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('dr-a', ?, 'dr@a.com', ?, 'Dr', 'staff')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('own-b', ?, 'b@b.com', ?, 'B', 'owner')`).run(tenantB, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('dr-b', ?, 'drb@b.com', ?, 'Dr B', 'staff')`).run(tenantB, hash);
  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, user_id, is_active, sort_order, created_at, updated_at)
    VALUES ('doc-b', ?, 'Dr B', 'Dr B', 'dr-b', 1, 0, datetime('now'), datetime('now'))
  `).run(tenantB);
  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, user_id, is_active, sort_order, created_at, updated_at)
    VALUES ('doc-a', ?, 'Dr A', 'Dr A', 'dr-a', 1, 0, datetime('now'), datetime('now'))
  `).run(tenantA);
  patientA = 'pat-amend-a';
  db.prepare(`INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES (?, ?, 'Pat', '9111111111', '9111111111')`).run(patientA, tenantA);
  doctorA = 'doc-a';
  tokenClinicianA = signToken({ id: 'dr-a', email: 'dr@a.com', role: 'staff', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  tokenClinicianB = signToken({ id: 'dr-b', email: 'drb@b.com', role: 'staff', tenant_id: tenantB, is_platform_admin: 0 }, { id: tenantB });
  tokenOwnerB = signToken({ id: 'own-b', email: 'b@b.com', role: 'owner', tenant_id: tenantB, is_platform_admin: 0 }, { id: tenantB });

  const user = { sub: 'dr-a', tenantId: tenantA, role: 'staff' };
  const enc = createEncounter(tenantA, user, { patientId: patientA, doctorId: doctorA, clinicalNote: 'Initial' });
  updateEncounterDraft(enc.id, tenantA, user, { prescriptionItems: [{ drugName: 'Med', dose: '1' }] });
  await finalizeEncounter(enc.id, tenantA, user);
  encounterA = enc.id;
});

after(() => {
  resetUploadStorageBackendForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createApp() {
  const app = express();
  app.use(express.json(jsonBodyParserOptions()));
  app.use(jsonBodyErrorHandler);
  app.use('/api', clinicRouter());
  return app;
}

async function request(app, method, url, { token, body } = {}) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('encounter amendment routes', () => {
  it('GET amendments returns history for same tenant', async () => {
    const app = createApp();
    const post = await request(app, 'POST', `/api/clinic/encounters/${encounterA}/amendments`, {
      token: tokenClinicianA,
      body: {
        reason: 'Route-level correction test',
        patch: { clinicalNote: 'Updated via route' },
      },
    });
    assert.equal(post.status, 200);

    const list = await request(app, 'GET', `/api/clinic/encounters/${encounterA}/amendments`, {
      token: tokenClinicianA,
    });
    assert.equal(list.status, 200);
    assert.ok(list.json.amendments.length >= 1);
  });

  it('cross-tenant GET amendments returns 404', async () => {
    const app = createApp();
    const res = await request(app, 'GET', `/api/clinic/encounters/${encounterA}/amendments`, {
      token: tokenOwnerB,
    });
    assert.equal(res.status, 404);
  });

  it('cross-tenant POST amendment returns 404', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/encounters/${encounterA}/amendments`, {
      token: tokenClinicianB,
      body: { reason: 'Cross tenant attempt', patch: { clinicalNote: 'Bad' } },
    });
    assert.equal(res.status, 404);
  });
});
