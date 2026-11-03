import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plat-billing-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'pb.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'plat-billing-secret';
process.env.CLINIC_RAZORPAY_MOCK = '1';
process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay';
process.env.CLINIC_RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.CLINIC_RAZORPAY_KEY_SECRET = 'secret';

const { initDatabase, getDb } = await import('../db/index.js');
const { createApiApp } = await import('../appFactory.js');
const { signToken } = await import('../middleware/auth.js');

let platformToken;
let ownerToken;

before(() => {
  initDatabase();
  getDb().prepare(`
    INSERT INTO tenants (id, slug, name, status, plan, subscription_status)
    VALUES ('t1', 'alpha', 'Alpha', 'active', 'essential', 'active')
  `).run();
  getDb().prepare(`
    INSERT INTO billing_discrepancies (id, run_id, tenant_id, kind, detail_json)
    VALUES ('d1', 'run1', 't1', 'provider_status_mismatch', '{"note":"test"}')
  `).run();
  platformToken = signToken(
    { id: 'plat-1', email: 'p@test', role: 'owner', tenant_id: null, is_platform_admin: 1 },
    null,
  );
  ownerToken = signToken(
    { id: 'own-1', email: 'o@test', role: 'owner', tenant_id: 't1', is_platform_admin: 0 },
    { id: 't1' },
  );
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function request(method, urlPath, { token, body } = {}) {
  const app = createApiApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('platform admin billing routes', () => {
  it('denies clinic owner on billing admin APIs', async () => {
    const res = await request('GET', '/api/platform/admin/billing/discrepancies', { token: ownerToken });
    assert.equal(res.status, 403);
  });

  it('lists discrepancies with tenant metadata for platform admin', async () => {
    const res = await request('GET', '/api/platform/admin/billing/discrepancies', { token: platformToken });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.discrepancies));
    assert.equal(res.json.discrepancies.some((d) => d.id === 'd1'), true);
    const row = res.json.discrepancies.find((d) => d.id === 'd1');
    assert.equal(row.tenantSlug, 'alpha');
  });

  it('runs reconciliation dry-run by default', async () => {
    const res = await request('POST', '/api/platform/admin/billing/reconcile', {
      token: platformToken,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.dryRun, true);
  });

  it('resolves a discrepancy', async () => {
    const res = await request('PATCH', '/api/platform/admin/billing/discrepancies/d1/resolve', {
      token: platformToken,
      body: { note: 'cleared in review' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, 'd1');
    const row = getDb().prepare('SELECT resolved_at FROM billing_discrepancies WHERE id = ?').get('d1');
    assert.ok(row.resolved_at);
  });
});
