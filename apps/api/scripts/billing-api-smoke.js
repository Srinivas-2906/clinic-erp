#!/usr/bin/env node
/**
 * Lightweight billing invariant smoke (no HTTP). Used in CI.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDb = path.join(os.tmpdir(), `billing-smoke-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';

const { initDatabase, getDb } = await import('../src/db/index.js');
const { createInvoice, createRefund, getInvoiceById } = await import('../src/services/patientInvoices.js');
const { createPayment } = await import('../src/services/clinicPayments.js');

initDatabase();
const db = getDb();
db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t1', 'demo', 'Demo', 'active')`).run();
db.prepare(`INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('p1', 't1', 'P', '9999999999', '9999999999')`).run();
const hash = bcrypt.hashSync('x', 10);
db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('o', 't1', 'o@t', ?, 'O', 'owner')`).run(hash);

const owner = { sub: 'o', tenantId: 't1', role: 'owner', isPlatformAdmin: false };
const rec = { sub: 'r', tenantId: 't1', role: 'receptionist', isPlatformAdmin: false };

const inv = createInvoice('t1', rec, {
  patientId: 'p1',
  lineItems: [{ description: 'X', unitPrice: 100, quantity: 1 }],
});
createPayment('t1', rec, { patientId: 'p1', amount: 40, invoiceId: inv.id, idempotencyKey: 'smoke-1' });
createPayment('t1', rec, { patientId: 'p1', amount: 60, invoiceId: inv.id, idempotencyKey: 'smoke-2' });
assert.equal(getInvoiceById(inv.id, 't1').status, 'paid');
const pay = createPayment('t1', rec, { patientId: 'p1', amount: 30, idempotencyKey: 'smoke-ref' });
createRefund('t1', owner, { paymentId: pay.id, amount: 10, idempotencyKey: 'smoke-r1' });

try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
console.log('billing-api-smoke: ok');
