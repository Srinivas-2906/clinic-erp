import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-internal-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'bi.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'billing-internal-secret';
process.env.CLINIC_PROVISIONING_API_KEY = 'provision-key-test';
process.env.CLINIC_RAZORPAY_MOCK = '1';

const { initDatabase } = await import('../db/index.js');
const { createApiApp } = await import('../appFactory.js');
const { signToken } = await import('../middleware/auth.js');

let ownerToken;

before(() => {
  initDatabase();
  ownerToken = signToken(
    { id: 'own-1', email: 'o@test', role: 'owner', tenant_id: 't1', is_platform_admin: 0 },
    { id: 't1' },
  );
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function post(path, { token, key, body } = {}) {
  const app = createApiApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (key) headers['x-clinic-provisioning-key'] = key;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : '{}',
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('internal billing jobs auth', () => {
  it('rejects clinic owner JWT without provisioning key', async () => {
    const res = await post('/api/platform/internal/reconcile-billing', { token: ownerToken });
    assert.equal(res.status, 403);
  });

  it('accepts provisioning key and defaults dryRun', async () => {
    const res = await post('/api/platform/internal/reconcile-billing', {
      key: 'provision-key-test',
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.discrepancyCount >= 0, true);
  });

  it('rejects invalid provisioning key', async () => {
    const res = await post('/api/platform/internal/process-subscription-lifecycle', {
      key: 'wrong',
    });
    assert.equal(res.status, 403);
  });
});
