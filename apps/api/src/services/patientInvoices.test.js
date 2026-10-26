import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDb = path.join(os.tmpdir(), `inv-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';

const { initDatabase, getDb } = await import('../db/index.js');
const { createInvoice, createRefund } = await import('./patientInvoices.js');
const { createPayment } = await import('./clinicPayments.js');

const owner = { sub: 'u-owner', tenantId: 't1', role: 'owner', isPlatformAdmin: false };
const receptionist = { sub: 'u-rec', tenantId: 't1', role: 'receptionist', isPlatformAdmin: false };

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t1', 'demo', 'Demo Clinic', 'active')`).run();
  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('p1', 't1', 'Test Patient', '9999999999', '9999999999')
  `).run();
  const hash = bcrypt.hashSync('x', 10);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-owner', 't1', 'o@test.invalid', ?, 'Owner', 'owner')
  `).run(hash);
});

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
});

describe('patientInvoices', () => {
  it('creates invoice with line items and accepts payment', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Consultation', unitPrice: 500, quantity: 1 }],
    });
    assert.equal(inv.total, 500);
    assert.equal(inv.balanceDue, 500);
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 200,
      invoiceId: inv.id,
      idempotencyKey: 'pay-1',
    });
    assert.equal(pay.amount, 200);
    const updated = getDb().prepare(`SELECT amount_paid, status FROM patient_invoices WHERE id = ?`).get(inv.id);
    assert.equal(updated.amount_paid, 200);
    assert.equal(updated.status, 'partial');
  });

  it('owner refund reduces invoice paid balance', () => {
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 100,
      idempotencyKey: 'pay-refund-1',
    });
    createRefund('t1', owner, { paymentId: pay.id, amount: 50, idempotencyKey: 'ref-1' });
    const refund = getDb().prepare(`SELECT amount, kind FROM patient_payments WHERE kind = 'refund' ORDER BY created_at DESC LIMIT 1`).get();
    assert.equal(refund.amount, -50);
  });

  it('receptionist cannot refund', () => {
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 50,
      idempotencyKey: 'pay-refund-2',
    });
    assert.throws(() => createRefund('t1', receptionist, { paymentId: pay.id }));
  });
});
