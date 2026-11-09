import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { assertCapability, canManageFinancials } from '../modules/identity/rolePolicy.js';
import { createRefund } from './patientInvoices.js';
import { getPaymentById } from './clinicPayments.js';
import { createRazorpayClient, shouldUseRazorpayMock } from '../modules/billing/razorpayClient.js';
import { logAudit } from './clinicAudit.js';

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function rowToRefund(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    paymentId: row.payment_id,
    amount: roundMoney(row.amount),
    currency: row.currency || 'INR',
    status: row.status,
    externalRefundId: row.external_refund_id || null,
    externalPaymentId: row.external_payment_id || null,
    failureReason: row.failure_reason || '',
    ledgerRefundId: row.ledger_refund_id || null,
    idempotencyKey: row.idempotency_key || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function razorpayClient() {
  const mock = shouldUseRazorpayMock() || !process.env.CLINIC_RAZORPAY_KEY_SECRET;
  return createRazorpayClient({
    keyId: process.env.CLINIC_RAZORPAY_KEY_ID,
    keySecret: process.env.CLINIC_RAZORPAY_KEY_SECRET || 'mock_secret',
    mock,
  });
}

export async function initiateProviderRefund(
  tenantId,
  user,
  { paymentId, amount, notes, idempotencyKey } = {},
) {
  assertCapability(user, canManageFinancials, 'Owner required for provider refunds');
  const db = getDb();

  if (idempotencyKey) {
    const existing = db.prepare(`
      SELECT * FROM provider_refunds WHERE tenant_id = ? AND idempotency_key = ?
    `).get(tenantId, idempotencyKey);
    if (existing) {
      const ledger = existing.ledger_refund_id
        ? getPaymentById(existing.ledger_refund_id, tenantId)
        : null;
      return { refund: rowToRefund(existing), ledgerRefund: ledger, idempotentReplay: true };
    }
  }

  const payment = getPaymentById(paymentId, tenantId);
  if (!payment) {
    const err = new Error('Payment not found');
    err.status = 404;
    throw err;
  }
  if (payment.kind !== 'payment' || payment.amount <= 0) {
    throw new Error('Only positive patient payments can be refunded at provider');
  }
  if (String(payment.method || '').toLowerCase() !== 'razorpay') {
    const err = new Error('Provider refund only supported for Razorpay patient payments');
    err.status = 400;
    err.code = 'PROVIDER_REFUND_UNSUPPORTED';
    throw err;
  }

  const externalPaymentId = String(payment.reference || '').trim();
  if (!externalPaymentId) {
    throw new Error('Payment is missing Razorpay payment id reference');
  }

  const already = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM provider_refunds
    WHERE tenant_id = ? AND payment_id = ? AND status IN ('pending', 'succeeded')
  `).get(tenantId, paymentId);
  const priorRefunded = Number(already?.s) || 0;
  const refundable = roundMoney(payment.amount - priorRefunded);
  const refundAmount = roundMoney(amount != null ? amount : refundable);
  if (refundAmount <= 0 || refundAmount > refundable + 0.001) {
    throw new Error(`Invalid refund amount (refundable ₹${refundable})`);
  }

  const refundId = nanoid(12);
  const client = razorpayClient();
  const amountPaise = Math.round(refundAmount * 100);

  db.prepare(`
    INSERT INTO provider_refunds (
      id, tenant_id, payment_id, amount, currency, status,
      external_payment_id, idempotency_key, created_by
    ) VALUES (?, ?, ?, ?, 'INR', 'pending', ?, ?, ?)
  `).run(refundId, tenantId, paymentId, refundAmount, externalPaymentId, idempotencyKey || null, user.sub);

  let providerRefund;
  let status = 'succeeded';
  let failureReason = '';
  try {
    providerRefund = await client.createRefund({
      paymentId: externalPaymentId,
      amount: amountPaise,
      notes: { tenant_id: tenantId, payment_id: paymentId, refund_row: refundId },
    });
    if (String(providerRefund?.status || '').toLowerCase() === 'failed') {
      status = 'failed';
      failureReason = providerRefund.error_description || 'Provider declined refund';
    }
  } catch (e) {
    status = 'failed';
    failureReason = e.message || 'Provider refund failed';
  }

  if (status === 'failed') {
    db.prepare(`
      UPDATE provider_refunds
      SET status = 'failed', failure_reason = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(failureReason, refundId, tenantId);
    logAudit(tenantId, user.sub, 'provider_refund_failed', 'provider_refund', refundId, { paymentId, failureReason });
    const err = new Error(failureReason);
    err.status = 502;
    err.code = 'PROVIDER_REFUND_FAILED';
    throw err;
  }

  const ledgerKey = idempotencyKey ? `ledger-${idempotencyKey}` : `provider-refund-ledger-${refundId}`;
  const ledgerRefund = createRefund(tenantId, user, {
    paymentId,
    amount: refundAmount,
    notes: notes ? `Provider refund: ${notes}` : `Provider refund ${providerRefund?.id || ''}`.trim(),
    idempotencyKey: ledgerKey,
  });

  db.prepare(`
    UPDATE provider_refunds
    SET status = 'succeeded', external_refund_id = ?, ledger_refund_id = ?, updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(providerRefund?.id || `mock_${refundId}`, ledgerRefund.id, refundId, tenantId);

  logAudit(tenantId, user.sub, 'provider_refund', 'provider_refund', refundId, {
    paymentId,
    amount: refundAmount,
    externalRefundId: providerRefund?.id,
    ledgerRefundId: ledgerRefund.id,
  });

  const row = db.prepare(`SELECT * FROM provider_refunds WHERE id = ? AND tenant_id = ?`).get(refundId, tenantId);
  return {
    refund: rowToRefund(row),
    ledgerRefund,
    provider: { mode: shouldUseRazorpayMock() ? 'mock' : 'test', id: providerRefund?.id },
  };
}

export function getProviderRefund(id, tenantId) {
  const row = getDb().prepare(`SELECT * FROM provider_refunds WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
  return row ? rowToRefund(row) : null;
}
