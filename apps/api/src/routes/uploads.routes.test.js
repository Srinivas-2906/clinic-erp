import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { buffer } from 'stream/consumers';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-upload-route-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-upload-routes';
process.env.CLINIC_FILES_STORAGE = 'memory';
process.env.CLINIC_FILES_PREFIX = 'clinic-files';
process.env.PUBLIC_URL = 'https://clinic-api.kaana.in';

const { initDatabase, getDb } = await import('../db/index.js');
const { signToken } = await import('../middleware/auth.js');
const { createMemoryUploadStorage, setUploadStorageBackendForTests, resetUploadStorageBackendForTests } =
  await import('../services/uploadStorage.js');
const { jsonBodyParserOptions } = await import('../config/httpBodyLimits.js');
const { jsonBodyErrorHandler } = await import('../middleware/jsonBodyError.js');
const { MAX_UPLOAD_BYTES } = await import('../services/uploadValidation.js');
const { clinicRouter } = await import('../routes/index.js');

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let tokenA;
let tokenB;
const tenantA = 'tenant-a';
const tenantB = 'tenant-b';

before(() => {
  setUploadStorageBackendForTests(createMemoryUploadStorage());
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, industry, plan, status, settings) VALUES (?, ?, ?, 'clinic', 'growth', 'active', '{}')`).run(
    tenantA, 'a', 'A',
  );
  db.prepare(`INSERT INTO tenants (id, slug, name, industry, plan, status, settings) VALUES (?, ?, ?, 'clinic', 'growth', 'active', '{}')`).run(
    tenantB, 'b', 'B',
  );
  const hash = bcrypt.hashSync('x', 4);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u1', ?, 'a@t.com', ?, 'A', 'owner')`).run(tenantA, hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u2', ?, 'b@t.com', ?, 'B', 'owner')`).run(tenantB, hash);
  tokenA = signToken({ id: 'u1', email: 'a@t.com', role: 'owner', tenant_id: tenantA, is_platform_admin: 0 }, { id: tenantA });
  tokenB = signToken({ id: 'u2', email: 'b@t.com', role: 'owner', tenant_id: tenantB, is_platform_admin: 0 }, { id: tenantB });
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

describe('upload routes', () => {
  it('rejects unauthenticated upload', async () => {
    const app = createApp();
    const res = await request(app, 'POST', '/api/clinic/uploads', {
      body: { data: TINY_PNG_B64, contentType: 'image/png' },
    });
    assert.equal(res.status, 401);
  });

  it('authenticated upload returns url and path', async () => {
    const app = createApp();
    const res = await request(app, 'POST', '/api/clinic/uploads', {
      token: tokenA,
      body: { data: TINY_PNG_B64, contentType: 'image/png' },
    });
    assert.equal(res.status, 201);
    assert.match(res.json.url, /^https:\/\/clinic-api\.kaana\.in\/api\/clinic\/files\/tenant-a\//);
    assert.match(res.json.path, /^tenant-a\//);
  });

  it('cross-tenant download forbidden', async () => {
    const app = createApp();
    const up = await request(app, 'POST', '/api/clinic/uploads', {
      token: tokenA,
      body: { data: TINY_PNG_B64, contentType: 'image/png' },
    });
    const fileName = up.json.path.split('/')[1];
    const res = await request(app, 'GET', `/api/clinic/files/${tenantA}/${fileName}`, { token: tokenB });
    assert.equal(res.status, 403);
  });

  it('same-tenant download returns image content-type', async () => {
    const app = createApp();
    const up = await request(app, 'POST', '/api/clinic/uploads', {
      token: tokenA,
      body: { data: TINY_PNG_B64, contentType: 'image/png' },
    });
    const fileName = up.json.path.split('/')[1];
    const server = createApp().listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/clinic/files/${tenantA}/${fileName}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.match(res.headers.get('content-disposition') || '', /inline/i);
      await res.arrayBuffer();
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('missing file returns 404', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/files/tenant-a/nope.png', { token: tokenA });
    assert.equal(res.status, 404);
  });

  it('rejects traversal in fileName param', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/clinic/files/tenant-a/..%2F..%2Fetc%2Fpasswd', { token: tokenA });
    assert.ok(res.status === 400 || res.status === 404);
  });

  it('accepts JSON body larger than default 100kb (transport limit)', async () => {
    const app = createApp();
    const rawSize = 130 * 1024;
    const data = Buffer.alloc(rawSize, 0xff).toString('base64');
    const res = await request(app, 'POST', '/api/clinic/uploads', {
      token: tokenA,
      body: { data, contentType: 'image/jpeg' },
    });
    assert.notEqual(res.status, 413);
  });

  it('returns 413 with safe message when JSON body exceeds transport limit', async () => {
    const app = createApp();
    const appStrict = express();
    appStrict.use(express.json({ limit: '100kb' }));
    appStrict.use(jsonBodyErrorHandler);
    appStrict.use('/api', clinicRouter());
    const huge = 'x'.repeat(110 * 1024);
    const res = await request(appStrict, 'POST', '/api/clinic/uploads', {
      token: tokenA,
      body: { data: huge, contentType: 'image/png' },
    });
    assert.equal(res.status, 413);
    assert.match(res.json.error, /smaller than 8 MB/i);
  });

  it('rejects decoded file over 8 MB at application layer', async () => {
    const app = createApp();
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1).toString('base64');
    const res = await request(app, 'POST', '/api/clinic/uploads', {
      token: tokenA,
      body: { data: big, contentType: 'image/jpeg' },
    });
    assert.equal(res.status, 400);
    assert.match(String(res.json.error), /too large/i);
  });
});
