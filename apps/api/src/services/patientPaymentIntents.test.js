import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDb = path.join(os.tmpdir(), `ppi-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay';
process.env.CLINIC_RAZORPAY_KEY_ID = 'rzp_test_intent';
process.env.CLINIC_RAZORPAY_KEY_SECRET = 'intent_test_secret';
process.env.CLINIC_RAZORPAY_MOCK = '1';

const { initDatabase, getDb } = await import('../db/index.js');
const { createInvoice } = await import('./patientInvoices.js');
const {
  createPatientPaymentIntent,
  verifyPatientPaymentIntent,
  getPatientPaymentIntent,
  reconcilePatientPaymentIntents,
} = await import('./patientPaymentIntents.service.js');
const { getInvoiceById } = await import('./patientInvoices.js');

const owner = { sub: 'u-owner', tenantId: 't1', role: 'owner', isPlatformAdmin: false };
const receptionist = { sub: 'u-rec', tenantId: 't1', role: 'receptionist', isPlatformAdmin: false };
const doctor = { sub: 'u-doc', tenantId: 't1', role: 'doctor', isPlatformAdmin: false };

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t1', 'demo', 'Demo Clinic', 'active')`).run();
  db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t2', 'other', 'Other', 'active')`).run();
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

function openInvoice(total = 200) {
  return createInvoice('t1', owner, {
    patientId: 'p1',
    lineItems: [{ description: 'Consult', unitPrice: total, quantity: 1 }],
  });
}

describe('patientPaymentIntents', () => {
  it('creates intent with mock capture hints', async () => {
    const inv = openInvoice(500);
    const payload = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id });
    assert.ok(payload.intent.id);
    assert.equal(payload.intent.amount, 500);
    assert.ok(payload.mockCapture?.razorpay_order_id);
    assert.ok(payload.mockCapture?.razorpay_signature);
  });

  it('verifies signature and records partial payment', async () => {
    const inv = openInvoice(400);
    const partial = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id, amount: 150 });
    const verified = verifyPatientPaymentIntent('t1', receptionist, partial.intent.id, partial.mockCapture);
    assert.equal(verified.payment.amount, 150);
    assert.equal(verified.intent.status, 'captured');
    const updated = getInvoiceById(inv.id, 't1');
    assert.equal(updated.status, 'partial');
    assert.equal(updated.amountPaid, 150);
  });

  it('rejects invalid signature', async () => {
    const inv = openInvoice(100);
    const payload = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id });
    assert.throws(
      () => verifyPatientPaymentIntent('t1', receptionist, payload.intent.id, {
        ...payload.mockCapture,
        razorpay_signature: 'bad',
      }),
      /signature/i,
    );
  });

  it('idempotent verify returns duplicate flag', async () => {
    const inv = openInvoice(80);
    const payload = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id });
    verifyPatientPaymentIntent('t1', receptionist, payload.intent.id, payload.mockCapture);
    const again = verifyPatientPaymentIntent('t1', receptionist, payload.intent.id, payload.mockCapture);
    assert.equal(again.duplicate, true);
  });

  it('enforces tenant isolation on intent lookup', async () => {
    const inv = openInvoice(120);
    const payload = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id });
    assert.equal(getPatientPaymentIntent(payload.intent.id, 't2'), null);
  });

  it('doctor cannot create intent', async () => {
    const inv = openInvoice(50);
    await assert.rejects(() => createPatientPaymentIntent('t1', doctor, { invoiceId: inv.id }), /required/i);
  });

  it('reconciliation reports healthy ledger linkage', async () => {
    const report = reconcilePatientPaymentIntents('t1', owner);
    assert.equal(report.healthy, true);
    assert.ok(Array.isArray(report.staleOpenIntents));
  });

  it('intent idempotency returns same row', async () => {
    const inv = openInvoice(90);
    const a = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id, idempotencyKey: 'idem-1' });
    const b = await createPatientPaymentIntent('t1', receptionist, { invoiceId: inv.id, idempotencyKey: 'idem-1' });
    assert.equal(a.intent.id, b.intent.id);
  });
});
