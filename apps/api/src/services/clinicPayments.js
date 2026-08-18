import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';

function rowToPayment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    appointmentId: row.appointment_id,
    amount: row.amount,
    method: row.method,
    reference: row.reference || '',
    notes: row.notes || '',
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createPayment(tenantId, data) {
  const id = nanoid(12);
  getDb().prepare(`
    INSERT INTO patient_payments (id, tenant_id, patient_id, appointment_id, amount, method, reference, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    data.patientId,
    data.appointmentId || null,
    data.amount,
    data.method || 'cash',
    data.reference || '',
    data.notes || '',
    data.status || 'paid',
  );
  return getPaymentById(id, tenantId);
}

export function getPaymentById(id, tenantId) {
  const row = getDb().prepare(`
    SELECT pp.*, p.name AS patient_name
    FROM patient_payments pp
    JOIN patients p ON p.id = pp.patient_id
    WHERE pp.id = ? AND pp.tenant_id = ?
  `).get(id, tenantId);
  return row ? rowToPayment(row) : null;
}

export function getPayments(tenantId, { patientId, limit = 100 } = {}) {
  let sql = `
    SELECT pp.*, p.name AS patient_name
    FROM patient_payments pp
    JOIN patients p ON p.id = pp.patient_id
    WHERE pp.tenant_id = ?
  `;
  const params = [tenantId];
  if (patientId) {
    sql += ' AND pp.patient_id = ?';
    params.push(patientId);
  }
  sql += ' ORDER BY pp.created_at DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(rowToPayment);
}

export function getPaymentsRange(tenantId, { from, to, patientId, limit = 5000 } = {}) {
  let sql = `
    SELECT pp.*, p.name AS patient_name
    FROM patient_payments pp
    JOIN patients p ON p.id = pp.patient_id
    WHERE pp.tenant_id = ?
  `;
  const params = [tenantId];
  if (patientId) {
    sql += ' AND pp.patient_id = ?';
    params.push(patientId);
  }
  if (from) {
    sql += ' AND date(pp.created_at) >= date(?)';
    params.push(from);
  }
  if (to) {
    sql += ' AND date(pp.created_at) <= date(?)';
    params.push(to);
  }
  sql += ' ORDER BY pp.created_at DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(rowToPayment);
}

export function getPaymentSummary(tenantId) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const db = getDb();
  const todayTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM patient_payments
    WHERE tenant_id = ? AND date(created_at) = date(?)
  `).get(tenantId, today)?.total ?? 0;
  const monthTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM patient_payments
    WHERE tenant_id = ? AND date(created_at) >= date(?)
  `).get(tenantId, monthStart)?.total ?? 0;
  const dueCount = db.prepare(`
    SELECT COUNT(*) AS c FROM patient_payments WHERE tenant_id = ? AND status = 'due'
  `).get(tenantId)?.c ?? 0;
  return { todayTotal, monthTotal, dueCount };
}

export function updatePayment(id, tenantId, patch = {}) {
  const fields = [];
  const params = [];

  if (patch.amount != null && !Number.isNaN(Number(patch.amount))) {
    fields.push('amount = ?');
    params.push(Number(patch.amount));
  }
  if (patch.method != null) {
    fields.push('method = ?');
    params.push(String(patch.method));
  }
  if (patch.reference != null) {
    fields.push('reference = ?');
    params.push(String(patch.reference));
  }
  if (patch.notes != null) {
    fields.push('notes = ?');
    params.push(String(patch.notes));
  }
  if (patch.status != null) {
    fields.push('status = ?');
    params.push(String(patch.status));
  }

  if (fields.length === 0) return getPaymentById(id, tenantId);

  getDb().prepare(`
    UPDATE patient_payments
    SET ${fields.join(', ')}
    WHERE id = ? AND tenant_id = ?
  `).run(...params, id, tenantId);

  return getPaymentById(id, tenantId);
}
