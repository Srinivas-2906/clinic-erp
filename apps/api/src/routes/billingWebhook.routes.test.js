import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-wh-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'wh.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay_sandbox';
process.env.CLINIC_RAZORPAY_WEBHOOK_SECRET = 'wh-route-secret';

const { initDatabase, getDb } = await import('../db/index.js');
const { createApiApp } = await import('../appFactory.js');
const { createSubscriptionCheckout } = await import('../modules/billing/subscriptionBilling.service.js');

const tenantId = 't-wh';

before(() => {
  initDatabase();
  getDb().prepare(`
    INSERT INTO tenants (id, slug, name, status, plan, subscription_status)
    VALUES (?, 'wh-clinic', 'WH Clinic', 'active', 'essential', 'trialing')
  `).run(tenantId);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function postWebhook(app, body, signature) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (signature) headers['x-razorpay-signature'] = signature;
    const res = await fetch(`http://127.0.0.1:${port}/api/platform/webhooks/razorpay-subscription`, {
      method: 'POST',
      headers,
      body,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('billing webhook HTTP', () => {
  it('returns 401 without valid signature', async () => {
    const app = createApiApp();
    const { status } = await postWebhook(app, '{}', 'bad');
    assert.equal(status, 401);
  });

  it('activates subscription with signed sandbox payload', async () => {
    const checkout = await createSubscriptionCheckout(tenantId, { sub: 'o1' }, { planId: 'professional' });
    const payload = {
      event: 'payment.captured',
      event_id: `evt_http_${Date.now()}`,
      payload: {
        payment: {
          entity: {
            id: 'pay_http',
            order_id: checkout.orderId,
            status: 'captured',
          },
        },
      },
    };
    const raw = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', process.env.CLINIC_RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    const app = createApiApp();
    const { status, json } = await postWebhook(app, raw, sig);
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    const row = getDb().prepare('SELECT plan, subscription_status FROM tenants WHERE id = ?').get(tenantId);
    assert.equal(row.plan, 'professional');
    assert.equal(row.subscription_status, 'active');
  });
});
