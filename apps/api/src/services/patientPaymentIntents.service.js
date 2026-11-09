import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { assertCapability, canRecordPayments, canManageFinancials } from '../modules/identity/rolePolicy.js';
import { getInvoiceById } from './patientInvoices.js';
import { createPayment, getPaymentById } from './clinicPayments.js';
import { getPaymentGatewayConfig } from '../modules/billing/paymentGateway.js';
import {
  buildMockRazorpayCapture,
  createRazorpayClient,
  shouldUseRazorpayMock,
  verifyRazorpayPaymentSignature,
} from '../modules/billing/razorpayClient.js';
import { logAudit } from './clinicAudit.js';

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function rowToIntent(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    invoiceId: row.invoice_id,
    amount: roundMoney(row.amount),
    currency: row.currency || 'INR',
    status: row.status,
    externalOrderId: row.external_order_id || null,
    externalPaymentId: row.external_payment_id || null,
    paymentId: row.payment_id || null,
    idempotencyKey: row.idempotency_key || null,
    failureReason: row.failure_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function patientCheckoutAllowed() {
  const cfg = getPaymentGatewayConfig();
  const mockPatient =
    shouldUseRazorpayMock() &&
    (process.env.CLINIC_E2E_MODE === '1' || process.env.CLINIC_PATIENT_PAYMENTS_MOCK === '1' || cfg.mode === 'test');
  if (mockPatient) {
    return { ok: true, cfg: { ...cfg, mode: 'test', checkoutEnabled: true, provider: 'razorpay' } };
  }
  if (!cfg.checkoutEnabled) return { ok: false, cfg };
  if (cfg.mode === 'sandbox' || cfg.mode === 'sandbox_blocked') {
    return { ok: false, cfg, reason: 'Patient online pay requires razorpay test mode or mock — not subscription sandbox.' };
  }
  return { ok: true, cfg };
}

function razorpayClientForPatient() {
  const keySecret = process.env.CLINIC_RAZORPAY_KEY_SECRET || 'mock_secret';
  const mock = shouldUseRazorpayMock() || !process.env.CLINIC_RAZORPAY_KEY_SECRET;
  return createRazorpayClient({
    keyId: process.env.CLINIC_RAZORPAY_KEY_ID,
    keySecret,
    mock,
  });
}

export async function createPatientPaymentIntent(tenantId, user, { invoiceId, amount, idempotencyKey } = {}) {
  assertCapability(user, canRecordPayments, 'Owner or receptionist required');
  const gate = patientCheckoutAllowed();
  if (!gate.ok) {
    const err = new Error(gate.reason || 'Online payment is not available');
    err.status = 503;
    err.code = 'PAYMENT_CHECKOUT_DISABLED';
    throw err;
  }

  const db = getDb();
  if (idempotencyKey) {
    const existing = db.prepare(`
      SELECT id FROM patient_payment_intents WHERE tenant_id = ? AND idempotency_key = ?
    `).get(tenantId, idempotencyKey);
    if (existing) {
      const intent = getPatientPaymentIntent(existing.id, tenantId);
      const keySecret = process.env.CLINIC_RAZORPAY_KEY_SECRET || 'mock_secret';
      return {
        intent,
        order: intent?.externalOrderId
          ? { id: intent.externalOrderId, amount: Math.round(intent.amount * 100), currency: intent.currency }
          : null,
        gateway: { mode: 'test', provider: 'razorpay' },
        mockCapture: intent?.externalOrderId
          ? buildMockRazorpayCapture(intent.externalOrderId, keySecret)
          : undefined,
        idempotentReplay: true,
      };
    }
  }

  const invoice = getInvoiceById(invoiceId, tenantId);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (invoice.status === 'void' || invoice.status === 'paid' || invoice.balanceDue <= 0) {
    throw new Error('Invoice is not open for payment');
  }

  const payAmount = roundMoney(amount != null ? amount : invoice.balanceDue);
  if (payAmount <= 0 || payAmount > invoice.balanceDue + 0.001) {
    throw new Error('Payment amount must be positive and not exceed balance due');
  }

  const client = razorpayClientForPatient();
  const amountPaise = Math.round(payAmount * 100);
  const intentId = nanoid(12);

  const order = await client.createOrder({
    amount: amountPaise,
    currency: invoice.currency || 'INR',
    receipt: `inv_${invoice.id}_${intentId}`,
    notes: {
      tenant_id: tenantId,
      invoice_id: invoice.id,
      patient_id: invoice.patientId,
      intent_id: intentId,
    },
  });

  db.prepare(`
    INSERT INTO patient_payment_intents (
      id, tenant_id, patient_id, invoice_id, amount, currency, status,
      external_order_id, idempotency_key, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
  `).run(
    intentId,
    tenantId,
    invoice.patientId,
    invoice.id,
    payAmount,
    invoice.currency || 'INR',
    order.id,
    idempotencyKey || null,
    user.sub,
  );

  const intent = rowToIntent(
    db.prepare(`SELECT * FROM patient_payment_intents WHERE id = ? AND tenant_id = ?`).get(intentId, tenantId),
  );

  const keySecret = process.env.CLINIC_RAZORPAY_KEY_SECRET || client.keySecret || 'mock_secret';
  const mockCapture =
    shouldUseRazorpayMock() || !process.env.CLINIC_RAZORPAY_KEY_SECRET
      ? buildMockRazorpayCapture(order.id, keySecret)
      : undefined;

  logAudit(tenantId, user.sub, 'create', 'payment_intent', intentId, {
    invoiceId: invoice.id,
    amount: payAmount,
    orderId: order.id,
  });

  return {
    intent,
    order: { id: order.id, amount: amountPaise, currency: order.currency || 'INR' },
    gateway: { mode: gate.cfg.mode, provider: gate.cfg.provider },
    mockCapture,
  };
}

export function getPatientPaymentIntent(id, tenantId) {
  const row = getDb().prepare(`SELECT * FROM patient_payment_intents WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
  return row ? rowToIntent(row) : null;
}

export function verifyPatientPaymentIntent(
  tenantId,
  user,
  intentId,
  { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = {},
) {
  assertCapability(user, canRecordPayments, 'Owner or receptionist required');
  const db = getDb();
  const row = db.prepare(`SELECT * FROM patient_payment_intents WHERE id = ? AND tenant_id = ?`).get(intentId, tenantId);
  if (!row) {
    const err = new Error('Payment intent not found');
    err.status = 404;
    throw err;
  }
  if (row.status === 'captured' && row.payment_id) {
    return {
      intent: rowToIntent(row),
      payment: getPaymentById(row.payment_id, tenantId),
      duplicate: true,
    };
  }
  if (row.status === 'failed') {
    throw new Error('Payment intent failed — create a new intent');
  }

  const extOrder = String(orderId || '').trim();
  const extPay = String(paymentId || '').trim();
  if (!extOrder || !extPay || !signature) {
    throw new Error('razorpay_order_id, razorpay_payment_id, and razorpay_signature are required');
  }
  if (row.external_order_id && row.external_order_id !== extOrder) {
    throw new Error('Order id does not match intent');
  }

  const keySecret = process.env.CLINIC_RAZORPAY_KEY_SECRET || 'mock_secret';
  if (!verifyRazorpayPaymentSignature({ orderId: extOrder, paymentId: extPay, signature, keySecret })) {
    const err = new Error('Payment signature verification failed');
    err.status = 400;
    err.code = 'PAYMENT_SIGNATURE_INVALID';
    throw err;
  }

  const captureKey = `intent-capture-${intentId}-${extPay}`;
  const payment = createPayment(tenantId, user, {
    patientId: row.patient_id,
    amount: row.amount,
    method: 'razorpay',
    reference: extPay,
    notes: `Razorpay order ${extOrder}`,
    invoiceId: row.invoice_id,
    idempotencyKey: captureKey,
    status: 'paid',
  });
  db.prepare(`
    UPDATE patient_payment_intents
    SET status = 'captured', external_payment_id = ?, payment_id = ?, updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(extPay, payment.id, intentId, tenantId);

  logAudit(tenantId, user.sub, 'capture', 'payment_intent', intentId, {
    paymentId: payment.id,
    externalPaymentId: extPay,
  });
  return {
    intent: rowToIntent(db.prepare(`SELECT * FROM patient_payment_intents WHERE id = ? AND tenant_id = ?`).get(intentId, tenantId)),
    payment,
    duplicate: false,
  };
}

/** Owner reconciliation — stale intents and ledger cross-check. */
export function reconcilePatientPaymentIntents(tenantId, user) {
  assertCapability(user, canManageFinancials, 'Owner required');
  const db = getDb();
  const stale = db.prepare(`
    SELECT * FROM patient_payment_intents
    WHERE tenant_id = ? AND status = 'created'
      AND datetime(created_at) < datetime('now', '-1 hour')
    ORDER BY datetime(created_at) ASC
    LIMIT 200
  `).all(tenantId).map(rowToIntent);

  const capturedWithoutPayment = db.prepare(`
    SELECT i.* FROM patient_payment_intents i
    LEFT JOIN patient_payments p ON p.id = i.payment_id AND p.tenant_id = i.tenant_id
    WHERE i.tenant_id = ? AND i.status = 'captured' AND (i.payment_id IS NULL OR p.id IS NULL)
  `).all(tenantId).map(rowToIntent);

  const openIntentTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM patient_payment_intents
    WHERE tenant_id = ? AND status = 'created'
  `).get(tenantId)?.s ?? 0;

  return {
    staleOpenIntents: stale,
    capturedMissingLedger: capturedWithoutPayment,
    openIntentExposure: roundMoney(openIntentTotal),
    healthy: capturedWithoutPayment.length === 0,
  };
}
