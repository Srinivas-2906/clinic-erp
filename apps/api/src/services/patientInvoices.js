import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { getPatientById } from './clinicStore.js';
import { logAudit } from './clinicAudit.js';
import { assertCapability, canManageFinancials, canRecordPayments } from '../modules/identity/rolePolicy.js';

const INVOICE_STATUS = {
  OPEN: 'open',
  PARTIAL: 'partial',
  PAID: 'paid',
  VOID: 'void',
};

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function rowToInvoice(row, lineItems = []) {
  if (!row) return null;
  const total = roundMoney(row.total);
  const amountPaid = roundMoney(row.amount_paid);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id || null,
    encounterId: row.encounter_id || null,
    status: row.status,
    total,
    amountPaid,
    balanceDue: roundMoney(total - amountPaid),
    currency: row.currency || 'INR',
    notes: row.notes || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineItems,
  };
}

function loadLineItems(invoiceId, tenantId) {
  return getDb().prepare(`
    SELECT * FROM invoice_line_items
    WHERE invoice_id = ? AND tenant_id = ?
    ORDER BY sort_order ASC, description ASC
  `).all(invoiceId, tenantId).map((r) => ({
    id: r.id,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    amount: r.amount,
    catalogItemId: r.catalog_item_id || null,
  }));
}

function computeLineTotal(quantity, unitPrice) {
  return roundMoney(Number(quantity) * Number(unitPrice));
}

function recomputeInvoiceTotals(db, invoiceId, tenantId) {
  const sum = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_line_items WHERE invoice_id = ? AND tenant_id = ?
  `).get(invoiceId, tenantId)?.s ?? 0;
  const total = roundMoney(sum);
  const inv = db.prepare(`SELECT amount_paid, status FROM patient_invoices WHERE id = ? AND tenant_id = ?`).get(invoiceId, tenantId);
  if (!inv) return;
  let status = inv.status;
  if (status !== INVOICE_STATUS.VOID) {
    const paid = roundMoney(inv.amount_paid);
    if (paid <= 0) status = INVOICE_STATUS.OPEN;
    else if (paid >= total) status = INVOICE_STATUS.PAID;
    else status = INVOICE_STATUS.PARTIAL;
  }
  db.prepare(`
    UPDATE patient_invoices SET total = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(total, status, invoiceId, tenantId);
}

export function getInvoiceById(id, tenantId) {
  const row = getDb().prepare(`SELECT * FROM patient_invoices WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
  return row ? rowToInvoice(row, loadLineItems(id, tenantId)) : null;
}

export function listInvoices(tenantId, { patientId, status, limit = 100 } = {}) {
  let sql = `SELECT * FROM patient_invoices WHERE tenant_id = ?`;
  const params = [tenantId];
  if (patientId) {
    sql += ' AND patient_id = ?';
    params.push(patientId);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map((row) => rowToInvoice(row, loadLineItems(row.id, tenantId)));
}

export function createInvoice(tenantId, user, data = {}) {
  assertCapability(user, canRecordPayments, 'Owner or receptionist required to create invoices');
  const patientId = String(data.patientId || '').trim();
  if (!patientId || !getPatientById(patientId, tenantId)) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }
  const id = nanoid(12);
  const db = getDb();
  db.prepare(`
    INSERT INTO patient_invoices (
      id, tenant_id, patient_id, appointment_id, encounter_id, status, total, amount_paid,
      currency, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'INR', ?, ?)
  `).run(
    id,
    tenantId,
    patientId,
    data.appointmentId || null,
    data.encounterId || null,
    INVOICE_STATUS.OPEN,
    String(data.notes || '').trim(),
    user.sub,
  );

  const items = Array.isArray(data.lineItems) ? data.lineItems : [];
  items.forEach((item, idx) => {
    const desc = String(item.description || '').trim();
    if (!desc) return;
    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const unit = roundMoney(item.unitPrice ?? item.amount ?? 0);
    const amount = computeLineTotal(qty, unit);
    db.prepare(`
      INSERT INTO invoice_line_items (id, tenant_id, invoice_id, description, quantity, unit_price, amount, catalog_item_id, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nanoid(12), tenantId, id, desc, qty, unit, amount, item.catalogItemId || null, idx);
  });
  recomputeInvoiceTotals(db, id, tenantId);
  logAudit(tenantId, user.sub, 'create', 'invoice', id, { patientId });
  return getInvoiceById(id, tenantId);
}

export function applyPaymentToInvoice(tenantId, user, invoiceId, paymentRow) {
  const db = getDb();
  const inv = db.prepare(`SELECT * FROM patient_invoices WHERE id = ? AND tenant_id = ?`).get(invoiceId, tenantId);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === INVOICE_STATUS.VOID) throw new Error('Cannot pay a void invoice');
  const amount = roundMoney(paymentRow.amount);
  if (amount <= 0) throw new Error('Payment amount must be positive');
  const newPaid = roundMoney(inv.amount_paid + amount);
  db.prepare(`
    UPDATE patient_invoices SET amount_paid = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?
  `).run(newPaid, invoiceId, tenantId);
  recomputeInvoiceTotals(db, invoiceId, tenantId);
  logAudit(tenantId, user.sub, 'payment_applied', 'invoice', invoiceId, { paymentId: paymentRow.id, amount });
}

export function voidInvoice(tenantId, user, invoiceId, { reason } = {}) {
  assertCapability(user, canManageFinancials, 'Owner required to void invoices');
  const db = getDb();
  const inv = db.prepare(`SELECT * FROM patient_invoices WHERE id = ? AND tenant_id = ?`).get(invoiceId, tenantId);
  if (!inv) throw new Error('Invoice not found');
  if (inv.amount_paid > 0) throw new Error('Cannot void an invoice with payments; issue refunds first');
  db.prepare(`
    UPDATE patient_invoices SET status = ?, notes = COALESCE(notes, '') || ?, updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(INVOICE_STATUS.VOID, reason ? `\n[void] ${reason}` : '', invoiceId, tenantId);
  logAudit(tenantId, user.sub, 'void', 'invoice', invoiceId, { reason: reason || '' });
  return getInvoiceById(invoiceId, tenantId);
}

export function createRefund(tenantId, user, { paymentId, amount, notes, idempotencyKey } = {}) {
  assertCapability(user, canManageFinancials, 'Owner required for refunds');
  const db = getDb();
  const original = db.prepare(`
    SELECT * FROM patient_payments WHERE id = ? AND tenant_id = ? AND kind = 'payment'
  `).get(paymentId, tenantId);
  if (!original) throw new Error('Original payment not found');
  if (idempotencyKey) {
    const dup = db.prepare(`
      SELECT id FROM patient_payments WHERE tenant_id = ? AND idempotency_key = ?
    `).get(tenantId, idempotencyKey);
    if (dup) return db.prepare(`SELECT * FROM patient_payments WHERE id = ?`).get(dup.id);
  }
  const refundAmount = roundMoney(amount ?? original.amount);
  if (refundAmount <= 0 || refundAmount > roundMoney(original.amount)) {
    throw new Error('Invalid refund amount');
  }
  const id = nanoid(12);
  db.prepare(`
    INSERT INTO patient_payments (
      id, tenant_id, patient_id, appointment_id, amount, method, reference, notes, status,
      invoice_id, kind, related_payment_id, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'refunded', ?, 'refund', ?, ?)
  `).run(
    id,
    tenantId,
    original.patient_id,
    original.appointment_id,
    -refundAmount,
    original.method,
    `refund:${original.id}`,
    String(notes || '').trim(),
    original.invoice_id,
    original.id,
    idempotencyKey || null,
  );
  if (original.invoice_id) {
    const inv = db.prepare(`SELECT amount_paid FROM patient_invoices WHERE id = ? AND tenant_id = ?`).get(original.invoice_id, tenantId);
    if (inv) {
      const newPaid = roundMoney(Math.max(0, inv.amount_paid - refundAmount));
      db.prepare(`UPDATE patient_invoices SET amount_paid = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
        .run(newPaid, original.invoice_id, tenantId);
      recomputeInvoiceTotals(db, original.invoice_id, tenantId);
    }
  }
  logAudit(tenantId, user.sub, 'refund', 'payment', id, { relatedPaymentId: paymentId, amount: refundAmount });
  return db.prepare(`
    SELECT pp.*, p.name AS patient_name FROM patient_payments pp
    JOIN patients p ON p.id = pp.patient_id WHERE pp.id = ?
  `).get(id);
}

export { INVOICE_STATUS };
