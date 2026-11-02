import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-sub-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'billing.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay_sandbox';
process.env.CLINIC_RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';

const { initDatabase, getDb } = await import('../../db/index.js');
const {
  createSubscriptionCheckout,
  processSubscriptionWebhook,
  verifyRazorpayWebhookSignature,
  buildSandboxWebhookPayload,
  listSubscriptionEvents,
  transitionTenantSubscription,
} = await import('./subscriptionBilling.service.js');
const { SUBSCRIPTION_STATUS } = await import('../identity/subscription.js');
const { GATEWAY_STATUS } = await import('./paymentGateway.js');

const tenantId = 'tenant-bill-1';

before(() => {
  initDatabase();
  getDb().prepare(`
    INSERT INTO tenants (id, slug, name, status, plan, subscription_status, trial_ends_at)
    VALUES (?, 'bill-clinic', 'Bill Clinic', 'active', 'essential', 'trialing', datetime('now', '+7 days'))
  `).run(tenantId);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('subscription billing sandbox', () => {
  it('creates checkout and idempotent replay', () => {
    const user = { sub: 'owner-1' };
    const first = createSubscriptionCheckout(tenantId, user, {
      planId: 'professional',
      idempotencyKey: 'idem-1',
    });
    assert.ok(first.orderId);
    assert.equal(first.planId, 'professional');
    assert.equal(first.status, 'pending');

    const second = createSubscriptionCheckout(tenantId, user, {
      planId: 'professional',
      idempotencyKey: 'idem-1',
    });
    assert.equal(second.transactionId, first.transactionId);
    assert.equal(second.orderId, first.orderId);
  });

  it('activates plan on verified webhook and dedupes events', () => {
    const checkout = createSubscriptionCheckout(tenantId, { sub: 'owner-1' }, { planId: 'professional' });
    const payload = buildSandboxWebhookPayload(checkout.orderId);
    const raw = JSON.stringify(payload);

    const r1 = processSubscriptionWebhook('razorpay', payload, { rawBody: raw });
    assert.equal(r1.duplicate, false);
    assert.equal(r1.status, 'succeeded');

    const row = getDb().prepare('SELECT subscription_status, plan FROM tenants WHERE id = ?').get(tenantId);
    assert.equal(row.subscription_status, SUBSCRIPTION_STATUS.ACTIVE);
    assert.equal(row.plan, 'professional');

    const r2 = processSubscriptionWebhook('razorpay', payload, { rawBody: raw });
    assert.equal(r2.duplicate, true);
  });

  it('rejects invalid webhook signatures', () => {
    const raw = '{"event_id":"x"}';
    const bad = verifyRazorpayWebhookSignature(raw, 'not-valid');
    assert.equal(bad.ok, false);
    const sig = crypto.createHmac('sha256', process.env.CLINIC_RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    const good = verifyRazorpayWebhookSignature(raw, sig);
    assert.equal(good.ok, true);
  });

  it('marks past_due on failed payment webhook', () => {
    const checkout = createSubscriptionCheckout(tenantId, { sub: 'owner-1' }, { planId: 'essential' });
    const payload = {
      event: 'payment.failed',
      event_id: `evt_fail_${Date.now()}`,
      payload: {
        payment: {
          entity: {
            id: 'pay_fail',
            order_id: checkout.orderId,
            status: 'failed',
            error_description: 'declined',
          },
        },
      },
    };
    processSubscriptionWebhook('razorpay', payload, { rawBody: JSON.stringify(payload) });
    const row = getDb().prepare('SELECT subscription_status FROM tenants WHERE id = ?').get(tenantId);
    assert.equal(row.subscription_status, SUBSCRIPTION_STATUS.PAST_DUE);
  });

  it('records subscription events on manual transition', () => {
    transitionTenantSubscription(tenantId, 'admin-1', {
      subscriptionStatus: SUBSCRIPTION_STATUS.CANCELED,
      source: 'platform_admin',
      note: 'Support ticket',
    });
    const events = listSubscriptionEvents(tenantId);
    assert.ok(events.some((e) => e.toStatus === SUBSCRIPTION_STATUS.CANCELED));
  });

  it('ignores duplicate capture after success', () => {
    const checkout = createSubscriptionCheckout(tenantId, { sub: 'owner-1' }, { planId: 'essential' });
    const payload = buildSandboxWebhookPayload(checkout.orderId);
    const raw = JSON.stringify(payload);
    processSubscriptionWebhook('razorpay', payload, { rawBody: raw });
    const dup = { ...payload, event_id: `evt_dup_${Date.now()}` };
    processSubscriptionWebhook('razorpay', dup, { rawBody: JSON.stringify(dup) });
    const txs = getDb().prepare('SELECT status FROM billing_transactions WHERE external_order_id = ?').get(checkout.orderId);
    assert.equal(txs.status, GATEWAY_STATUS.SUCCEEDED);
  });

  it('rejects amount mismatch on capture', () => {
    const checkout = createSubscriptionCheckout(tenantId, { sub: 'owner-1' }, { planId: 'essential' });
    const payload = {
      event: 'payment.captured',
      event_id: `evt_bad_amt_${Date.now()}`,
      payload: {
        payment: {
          entity: {
            id: 'pay_bad',
            order_id: checkout.orderId,
            status: 'captured',
            amount: 100,
            currency: 'INR',
          },
        },
      },
    };
    assert.throws(
      () => processSubscriptionWebhook('razorpay', payload, { rawBody: JSON.stringify(payload) }),
      (e) => e.code === 'AMOUNT_MISMATCH',
    );
  });
});
