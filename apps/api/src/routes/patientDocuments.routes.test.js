import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patient-doc-routes-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-patient-docs';
process.env.CLINIC_FILES_STORAGE = 'memory';
process.env.PUBLIC_URL = 'https://clinic-api.kaana.in';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

const tenantA = 'tenant-pd-a';
const tenantB = 'tenant-pd-b';
let tokenOwnerA;
let tokenOwnerB;
let tokenAccountantA;
let patientA;

before(() => {
  setUploadStorageBackendForTests(createMemoryUploadStorage());
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, industry, plan, status, settings) VALUES (?, 'pda', 'A', 'clinic', 'growth', 'active', '{}')`).run(tenantA);
  db.prepare(`INSERT INTO tenants (id, slug, name, industry, plan, status, settings) VALUES (?, 'pdb', 'B', 'clinic', 'growth', 'active', '{}')`).run(tenantB);
  const hash = bcrypt.hashSync('x', 4);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-own', ?, 'own@a.com', ?, 'Own', 'owner')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-acct', ?, 'acct@a.com', ?, 'Acct', 'accountant')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-b', ?, 'b@b.com', ?, 'B', 'owner')`).run(tenantB, hash);
  patientA = 'pat-pd-a';
  db.prepare(`INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES (?, ?, 'Pat A', '9000000011', '9000000011')`).run(patientA, tenantA);
  tokenOwnerA = signToken({ id: 'u-own', email: 'own@a.com', role: 'owner', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  tokenAccountantA = signToken({ id: 'u-acct', email: 'acct@a.com', role: 'accountant', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  tokenOwnerB = signToken({ id: 'u-b', email: 'b@b.com', role: 'owner', tenant_id: tenantB, is_platform_admin: 0 }, { id: tenantB });
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
    return { status: res.status, json, headers: res.headers };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('patient document routes', () => {
  it('rejects unauthenticated document upload', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/patients/${patientA}/documents`, {
      body: { data: TINY_PNG_B64, contentType: 'image/png', title: 'X' },
    });
    assert.equal(res.status, 401);
  });

  it('accountant cannot upload documents', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/patients/${patientA}/documents`, {
      token: tokenAccountantA,
      body: { data: TINY_PNG_B64, contentType: 'image/png', title: 'X' },
    });
    assert.equal(res.status, 403);
  });

  it('owner uploads, lists, and downloads registered clinical file', async () => {
    const app = createApp();
    const post = await request(app, 'POST', `/api/clinic/patients/${patientA}/documents`, {
      token: tokenOwnerA,
      body: { data: TINY_PNG_B64, contentType: 'image/png', title: 'Route E2E scan' },
    });
    assert.equal(post.status, 201);
    assert.equal(post.json.title, 'Route E2E scan');
    const fileName = post.json.fileUrl.split('/').pop();

    const list = await request(app, 'GET', `/api/clinic/patients/${patientA}/documents`, { token: tokenOwnerA });
    assert.equal(list.status, 200);
    assert.ok(list.json.documents.some((d) => d.id === post.json.id));

    const server = createApp().listen(0);
    const { port } = server.address();
    try {
      const dl = await fetch(`http://127.0.0.1:${port}/api/clinic/files/${tenantA}/${fileName}`, {
        headers: { Authorization: `Bearer ${tokenOwnerA}` },
      });
      assert.equal(dl.status, 200);
      assert.equal(dl.headers.get('content-type'), 'image/png');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('cross-tenant document list returns empty or 404 patient', async () => {
    const app = createApp();
    const res = await request(app, 'GET', `/api/clinic/patients/${patientA}/documents`, { token: tokenOwnerB });
    assert.equal(res.status, 404);
  });

  it('cross-tenant file GET forbidden for registered clinical doc', async () => {
    const app = createApp();
    const post = await request(app, 'POST', `/api/clinic/patients/${patientA}/documents`, {
      token: tokenOwnerA,
      body: { data: TINY_PNG_B64, contentType: 'image/png' },
    });
    const fileName = post.json.fileUrl.split('/').pop();
    const res = await request(app, 'GET', `/api/clinic/files/${tenantA}/${fileName}`, { token: tokenOwnerB });
    assert.equal(res.status, 403);
  });

  it('unregistered clinical-doc file returns 404 on GET', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/files/tenant-pd-a/clinical-doc-unregistered.png', {
      token: tokenOwnerA,
    });
    assert.equal(res.status, 404);
  });

  it('rejects invalid content type at application layer', async () => {
    const app = createApp();
    const res = await request(app, 'POST', `/api/clinic/patients/${patientA}/documents`, {
      token: tokenOwnerA,
      body: { data: Buffer.from('not-an-image').toString('base64'), contentType: 'image/png', title: 'Bad' },
    });
    assert.equal(res.status, 400);
  });
});
