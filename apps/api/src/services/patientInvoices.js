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

/** Non-void invoice already linked to this visit (appointment and/or encounter). */
export function findActiveInvoiceForVisit(tenantId, { patientId, appointmentId, encounterId } = {}) {
  const db = getDb();
  const apptId = appointmentId ? String(appointmentId).trim() : '';
  const encId = encounterId ? String(encounterId).trim() : '';
  if (apptId) {
    const row = db.prepare(`
      SELECT * FROM patient_invoices
      WHERE tenant_id = ? AND appointment_id = ? AND status != ?
      ORDER BY datetime(created_at) DESC LIMIT 1
    `).get(tenantId, apptId, INVOICE_STATUS.VOID);
    if (row) return rowToInvoice(row, loadLineItems(row.id, tenantId));
  }
  if (encId) {
    const row = db.prepare(`
      SELECT * FROM patient_invoices
      WHERE tenant_id = ? AND encounter_id = ? AND status != ?
      ORDER BY datetime(created_at) DESC LIMIT 1
    `).get(tenantId, encId, INVOICE_STATUS.VOID);
    if (row) return rowToInvoice(row, loadLineItems(row.id, tenantId));
  }
  if (patientId && (apptId || encId)) {
    return null;
  }
  return null;
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
  const appointmentId = data.appointmentId ? String(data.appointmentId).trim() : null;
  const encounterId = data.encounterId ? String(data.encounterId).trim() : null;
  const db = getDb();

  const run = () => {
    if (appointmentId || encounterId) {
      const existing = findActiveInvoiceForVisit(tenantId, { patientId, appointmentId, encounterId });
      if (existing) return existing;
    }
    const id = nanoid(12);
    try {
      db.prepare(`
        INSERT INTO patient_invoices (
          id, tenant_id, patient_id, appointment_id, encounter_id, status, total, amount_paid,
          currency, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'INR', ?, ?)
      `).run(
        id,
        tenantId,
        patientId,
        appointmentId,
        encounterId,
        INVOICE_STATUS.OPEN,
        String(data.notes || '').trim(),
        user.sub,
      );
    } catch (e) {
      if (isActiveVisitInvoiceConflict(e) && (appointmentId || encounterId)) {
        const existing = findActiveInvoiceForVisit(tenantId, { patientId, appointmentId, encounterId });
        if (existing) return existing;
      }
      throw e;
    }

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
  };

  return db.transaction(run)();
}

function isActiveVisitInvoiceConflict(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('UNIQUE constraint failed')
    && (msg.includes('idx_invoices_active_appointment') || msg.includes('idx_invoices_active_encounter'));
}

function getInvoiceBalanceDue(inv) {
  return roundMoney(Math.max(0, roundMoney(inv.total) - roundMoney(inv.amount_paid)));
}

function sumRefundedForPayment(db, paymentId, tenantId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(ABS(amount)), 0) AS s FROM patient_payments
    WHERE tenant_id = ? AND related_payment_id = ? AND kind = 'refund'
  `).get(tenantId, paymentId);
  return roundMoney(row?.s ?? 0);
}

/** Apply payment inside an existing transaction (no nested db.transaction). */
export function applyPaymentToInvoiceInTx(db, tenantId, invoiceId, paymentRow) {
  const inv = db.prepare(`SELECT * FROM patient_invoices WHERE id = ? AND tenant_id = ?`).get(invoiceId, tenantId);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === INVOICE_STATUS.VOID) throw new Error('Cannot pay a void invoice');
  if (paymentRow.patient_id && paymentRow.patient_id !== inv.patient_id) {
    throw new Error('Payment patient does not match invoice');
  }
  const amount = roundMoney(paymentRow.amount);
  if (amount <= 0) throw new Error('Payment amount must be positive');
  const balanceDue = getInvoiceBalanceDue(inv);
  if (amount > balanceDue + 0.001) {
    throw new Error(`Payment exceeds balance due (₹${balanceDue})`);
  }
  const newPaid = roundMoney(inv.amount_paid + amount);
  db.prepare(`
    UPDATE patient_invoices SET amount_paid = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?
  `).run(newPaid, invoiceId, tenantId);
  recomputeInvoiceTotals(db, invoiceId, tenantId);
}

export function applyPaymentToInvoice(tenantId, user, invoiceId, paymentRow) {
  const db = getDb();
  db.transaction(() => {
    applyPaymentToInvoiceInTx(db, tenantId, invoiceId, paymentRow);
  })();
  logAudit(tenantId, user.sub, 'payment_applied', 'invoice', invoiceId, { paymentId: paymentRow.id, amount: paymentRow.amount });
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
  if (original.amount <= 0) throw new Error('Cannot refund a non-positive payment');
  const id = nanoid(12);
  const runRefund = db.transaction(() => {
  if (idempotencyKey) {
    const dup = db.prepare(`
      SELECT id FROM patient_payments WHERE tenant_id = ? AND idempotency_key = ?
    `).get(tenantId, idempotencyKey);
    if (dup) {
      return db.prepare(`
        SELECT pp.*, p.name AS patient_name FROM patient_payments pp
        JOIN patients p ON p.id = pp.patient_id WHERE pp.id = ?
      `).get(dup.id);
    }
  }
  const alreadyRefunded = sumRefundedForPayment(db, paymentId, tenantId);
  const refundable = roundMoney(original.amount - alreadyRefunded);
  const refundAmount = roundMoney(amount ?? refundable);
  if (refundAmount <= 0 || refundAmount > refundable + 0.001) {
    throw new Error(`Invalid refund amount (refundable ₹${refundable})`);
  }
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
  return db.prepare(`
    SELECT pp.*, p.name AS patient_name FROM patient_payments pp
    JOIN patients p ON p.id = pp.patient_id WHERE pp.id = ?
  `).get(id);
  });
  const result = runRefund();
  logAudit(tenantId, user.sub, 'refund', 'payment', result.id, {
    relatedPaymentId: paymentId,
    amount: Math.abs(result.amount),
    note: 'ledger_refund_not_gateway',
  });
  return result;
}

export function getInvoiceFinancialSummary(tenantId) {
  const db = getDb();
  const outstanding = roundMoney(db.prepare(`
    SELECT COALESCE(SUM(total - amount_paid), 0) AS s FROM patient_invoices
    WHERE tenant_id = ? AND status IN ('open', 'partial')
  `).get(tenantId)?.s ?? 0);
  const openCount = db.prepare(`
    SELECT COUNT(*) AS c FROM patient_invoices WHERE tenant_id = ? AND status IN ('open', 'partial')
  `).get(tenantId)?.c ?? 0;
  return { outstandingBalance: outstanding, openInvoiceCount: openCount };
}

export { INVOICE_STATUS };
