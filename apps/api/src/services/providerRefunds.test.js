import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDb = path.join(os.tmpdir(), `prv-ref-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay';
process.env.CLINIC_RAZORPAY_KEY_ID = 'rzp_test_refund';
process.env.CLINIC_RAZORPAY_KEY_SECRET = 'refund_test_secret';
process.env.CLINIC_RAZORPAY_MOCK = '1';

const { initDatabase, getDb } = await import('../db/index.js');
const { createInvoice } = await import('./patientInvoices.js');
const { createPatientPaymentIntent, verifyPatientPaymentIntent } = await import('./patientPaymentIntents.service.js');
const { initiateProviderRefund } = await import('./providerRefunds.service.js');

const owner = { sub: 'u-owner', tenantId: 't1', role: 'owner', isPlatformAdmin: false };
const receptionist = { sub: 'u-rec', tenantId: 't1', role: 'receptionist', isPlatformAdmin: false };

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t1', 'demo', 'Demo', 'active')`).run();
  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('p1', 't1', 'Pat', '9999999999', '9999999999')
  `).run();
  const hash = bcrypt.hashSync('x', 10);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-owner', 't1', 'o@test', ?, 'O', 'owner')`).run(hash);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-rec', 't1', 'r@test', ?, 'R', 'receptionist')`).run(hash);
});

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
});

describe('providerRefunds', () => {
  it('initiates provider refund after razorpay capture', async () => {
    const inv = createInvoice('t1', owner, {
      patientId: 'p1',
      lineItems: [{ description: 'S', unitPrice: 300, quantity: 1 }],
    });
    const intent = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id });
    const verified = await verifyPatientPaymentIntent('t1', receptionist, intent.intent.id, intent.mockCapture);
    const result = await initiateProviderRefund('t1', owner, {
      paymentId: verified.payment.id,
      amount: 100,
      idempotencyKey: 'ref-1',
    });
    assert.equal(result.refund.status, 'succeeded');
    assert.equal(result.refund.amount, 100);
    assert.ok(result.ledgerRefund);
    assert.equal(result.ledgerRefund.amount, -100);

    const replay = await initiateProviderRefund('t1', owner, {
      paymentId: verified.payment.id,
      amount: 100,
      idempotencyKey: 'ref-1',
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.refund.id, result.refund.id);
  });

  it('prevents over-refunding via provider', async () => {
    const inv = createInvoice('t1', owner, {
      patientId: 'p1',
      lineItems: [{ description: 'S', unitPrice: 80, quantity: 1 }],
    });
    const intent = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id });
    const verified = await verifyPatientPaymentIntent('t1', receptionist, intent.intent.id, intent.mockCapture);
    await initiateProviderRefund('t1', owner, { paymentId: verified.payment.id, amount: 50, idempotencyKey: 'ref-a' });
    await assert.rejects(
      () => initiateProviderRefund('t1', owner, { paymentId: verified.payment.id, amount: 50, idempotencyKey: 'ref-b' }),
      /refundable/i,
    );
  });
});
