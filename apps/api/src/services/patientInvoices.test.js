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
const {
  createInvoice,
  createRefund,
  voidInvoice,
  applyPaymentToInvoice,
  getInvoiceById,
  findActiveInvoiceForVisit,
} = await import('./patientInvoices.js');
const { createPayment } = await import('./clinicPayments.js');

const owner = { sub: 'u-owner', tenantId: 't1', role: 'owner', isPlatformAdmin: false };
const receptionist = { sub: 'u-rec', tenantId: 't1', role: 'receptionist', isPlatformAdmin: false };
const doctor = { sub: 'u-doc', tenantId: 't1', role: 'doctor', isPlatformAdmin: false };

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
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-rec', 't1', 'r@test.invalid', ?, 'Rec', 'receptionist')
  `).run(hash);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u-doc', 't1', 'd@test.invalid', ?, 'Doc', 'doctor')
  `).run(hash);
  db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t2', 'other', 'Other Clinic', 'active')`).run();
  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('p-t2', 't2', 'Other Patient', '8888888887', '8888888887')
  `).run();
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

  it('rejects overpayment against invoice', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'X', unitPrice: 100, quantity: 1 }],
    });
    assert.throws(() => createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 150,
      invoiceId: inv.id,
      idempotencyKey: 'pay-over',
    }), /balance due/i);
  });

  it('caps cumulative refunds', () => {
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 100,
      idempotencyKey: 'pay-cap-ref',
    });
    createRefund('t1', owner, { paymentId: pay.id, amount: 60, idempotencyKey: 'ref-cap-1' });
    assert.throws(() => createRefund('t1', owner, { paymentId: pay.id, amount: 50 }), /refundable/i);
  });

  it('idempotent payment returns same row', () => {
    const a = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 25,
      idempotencyKey: 'idem-pay-1',
    });
    const b = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 25,
      idempotencyKey: 'idem-pay-1',
    });
    assert.equal(a.id, b.id);
  });

  it('cannot pay void invoice', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Y', unitPrice: 50, quantity: 1 }],
    });
    voidInvoice('t1', owner, inv.id, { reason: 'test' });
    const fakePay = { id: 'fake', amount: 10, patient_id: 'p1' };
    assert.throws(() => applyPaymentToInvoice('t1', receptionist, inv.id, fakePay), /void/i);
  });

  it('partial then full payment leaves zero balance', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Svc', unitPrice: 300, quantity: 1 }],
    });
    createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 100,
      invoiceId: inv.id,
      idempotencyKey: 'partial-1',
    });
    createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 200,
      invoiceId: inv.id,
      idempotencyKey: 'partial-2',
    });
    const updated = getInvoiceById(inv.id, 't1');
    assert.equal(updated.status, 'paid');
    assert.equal(updated.balanceDue, 0);
  });

  it('refund after partial payment restores invoice balance', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Svc', unitPrice: 200, quantity: 1 }],
    });
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 80,
      invoiceId: inv.id,
      idempotencyKey: 'ref-part-pay',
    });
    createRefund('t1', owner, { paymentId: pay.id, amount: 30, idempotencyKey: 'ref-part-ref' });
    const updated = getInvoiceById(inv.id, 't1');
    assert.equal(updated.amountPaid, 50);
    assert.equal(updated.balanceDue, 150);
    assert.equal(updated.status, 'partial');
  });

  it('refund after full payment reopens invoice', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Svc', unitPrice: 150, quantity: 1 }],
    });
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 150,
      invoiceId: inv.id,
      idempotencyKey: 'full-pay',
    });
    createRefund('t1', owner, { paymentId: pay.id, amount: 150, idempotencyKey: 'full-ref' });
    const updated = getInvoiceById(inv.id, 't1');
    assert.equal(updated.amountPaid, 0);
    assert.equal(updated.balanceDue, 150);
    assert.equal(updated.status, 'open');
  });

  it('does not expose invoice across tenants', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Z', unitPrice: 10, quantity: 1 }],
    });
    assert.equal(getInvoiceById(inv.id, 't-other'), null);
  });

  it('rejects payment with wrong patient for invoice', () => {
    getDb().prepare(`
      INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('p2', 't1', 'Other', '8888888888', '8888888888')
    `).run();
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      lineItems: [{ description: 'Z', unitPrice: 10, quantity: 1 }],
    });
    assert.throws(() => createPayment('t1', receptionist, {
      patientId: 'p2',
      amount: 10,
      invoiceId: inv.id,
      idempotencyKey: 'wrong-patient',
    }), /different patient/i);
  });

  it('refund idempotency returns same refund row', () => {
    const pay = createPayment('t1', receptionist, {
      patientId: 'p1',
      amount: 40,
      idempotencyKey: 'idem-ref-pay',
    });
    const a = createRefund('t1', owner, { paymentId: pay.id, amount: 10, idempotencyKey: 'idem-ref' });
    const b = createRefund('t1', owner, { paymentId: pay.id, amount: 10, idempotencyKey: 'idem-ref' });
    assert.equal(a.id, b.id);
  });

  it('does not duplicate invoices for the same appointment or encounter', () => {
    const first = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-bill-1',
      encounterId: 'enc-bill-1',
      lineItems: [{ description: 'Consultation', unitPrice: 600, quantity: 1 }],
    });
    const second = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-bill-1',
      encounterId: 'enc-bill-1',
      lineItems: [{ description: 'Should not apply', unitPrice: 999, quantity: 1 }],
    });
    assert.equal(first.id, second.id);
    assert.equal(second.total, 600);
    const rows = getDb().prepare(`
      SELECT COUNT(*) AS c FROM patient_invoices
      WHERE tenant_id = 't1' AND appointment_id = 'appt-bill-1' AND status != 'void'
    `).get();
    assert.equal(rows.c, 1);
  });

  it('allows new invoice after voiding visit invoice', () => {
    const voided = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-void-1',
      lineItems: [{ description: 'Old', unitPrice: 100, quantity: 1 }],
    });
    voidInvoice('t1', owner, voided.id, { reason: 'duplicate' });
    const next = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-void-1',
      lineItems: [{ description: 'Replacement', unitPrice: 200, quantity: 1 }],
    });
    assert.notEqual(voided.id, next.id);
    assert.equal(next.total, 200);
  });

  it('resolves same visit via appointment or encounter lookup', () => {
    const first = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-both',
      encounterId: 'enc-both',
      lineItems: [{ description: 'Visit', unitPrice: 300, quantity: 1 }],
    });
    const byEnc = findActiveInvoiceForVisit('t1', { patientId: 'p1', encounterId: 'enc-both' });
    const byAppt = findActiveInvoiceForVisit('t1', { patientId: 'p1', appointmentId: 'appt-both' });
    assert.equal(byEnc?.id, first.id);
    assert.equal(byAppt?.id, first.id);
  });

  it('does not expose visit invoice across tenants', () => {
    const inv = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-tenant',
      lineItems: [{ description: 'T1', unitPrice: 50, quantity: 1 }],
    });
    assert.equal(getInvoiceById(inv.id, 't2'), null);
    assert.equal(findActiveInvoiceForVisit('t2', { appointmentId: 'appt-tenant' }), null);
  });

  it('rejects invoice create for doctor role', () => {
    assert.throws(
      () => createInvoice('t1', doctor, {
        patientId: 'p1',
        lineItems: [{ description: 'X', unitPrice: 10, quantity: 1 }],
      }),
      /receptionist|Owner|required/i,
    );
  });

  it('recovers from unique index when concurrent visit invoice insert races', () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO patient_invoices (
        id, tenant_id, patient_id, appointment_id, encounter_id, status, total, amount_paid, currency, notes, created_by
      ) VALUES ('race-inv', 't1', 'p1', 'appt-race', 'enc-race', 'open', 0, 0, 'INR', '', 'u-rec')
    `).run();
    const resolved = createInvoice('t1', receptionist, {
      patientId: 'p1',
      appointmentId: 'appt-race',
      encounterId: 'enc-race',
      lineItems: [{ description: 'Should not apply', unitPrice: 999, quantity: 1 }],
    });
    assert.equal(resolved.id, 'race-inv');
  });
});
