import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { logAudit } from '../../services/clinicAudit.js';
import { updateTenantSubscription } from '../../services/tenantProvisioning.js';
import {
  assertSubscriptionTransition,
  normalizeSubscriptionStatus,
  SUBSCRIPTION_STATUS,
  applyPlanChangeRules,
} from '../identity/subscription.js';
import { normalizePlanId, PLAN_DEFINITIONS } from '../identity/plans.js';
import { getPaymentGatewayConfig, GATEWAY_STATUS } from './paymentGateway.js';

const SANDBOX_PLAN_AMOUNTS_INR = {
  essential: 199900,
  professional: 499900,
  enterprise: 999900,
};

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function recordSubscriptionEvent(tenantId, {
  eventType,
  fromStatus,
  toStatus,
  fromPlan,
  toPlan,
  actorId = null,
  source = 'system',
  externalRef = null,
  note = null,
  payload = null,
} = {}) {
  const id = nanoid(12);
  getDb().prepare(`
    INSERT INTO subscription_events (
      id, tenant_id, event_type, from_status, to_status, from_plan, to_plan,
      actor_id, source, external_ref, note, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    eventType,
    fromStatus || null,
    toStatus || null,
    fromPlan || null,
    toPlan || null,
    actorId,
    source,
    externalRef,
    note,
    payload ? JSON.stringify(payload) : null,
  );
  return id;
}

export function listSubscriptionEvents(tenantId, { limit = 50 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return getDb().prepare(`
    SELECT id, tenant_id AS tenantId, event_type AS eventType,
           from_status AS fromStatus, to_status AS toStatus,
           from_plan AS fromPlan, to_plan AS toPlan,
           actor_id AS actorId, source, external_ref AS externalRef,
           note, created_at AS createdAt
    FROM subscription_events
    WHERE tenant_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(tenantId, cap);
}

export function listBillingTransactions(tenantId, { limit = 30 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 30, 1), 100);
  return getDb().prepare(`
    SELECT id, kind, plan_id AS planId, amount_cents AS amountCents, currency,
           status, provider, external_order_id AS externalOrderId,
           external_payment_id AS externalPaymentId, failure_reason AS failureReason,
           created_at AS createdAt, updated_at AS updatedAt
    FROM billing_transactions
    WHERE tenant_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(tenantId, cap);
}

export function transitionTenantSubscription(tenantId, actorId, {
  subscriptionStatus,
  planId,
  source = 'manual',
  note,
  externalRef,
} = {}) {
  const db = getDb();
  const row = db.prepare('SELECT plan, subscription_status FROM tenants WHERE id = ?').get(tenantId);
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  const fromStatus = normalizeSubscriptionStatus(row.subscription_status);
  const fromPlan = normalizePlanId(row.plan);
  let toStatus = subscriptionStatus !== undefined ? normalizeSubscriptionStatus(subscriptionStatus) : fromStatus;
  const toPlan = planId !== undefined ? normalizePlanId(planId) : fromPlan;

  if (subscriptionStatus !== undefined) {
    assertSubscriptionTransition(fromStatus, toStatus);
  }
  if (planId !== undefined && toPlan !== fromPlan) {
    applyPlanChangeRules({ currentPlanId: fromPlan, nextPlanId: toPlan });
  }

  updateTenantSubscription(tenantId, {
    subscriptionStatus: subscriptionStatus !== undefined ? toStatus : undefined,
    planId: planId !== undefined ? toPlan : undefined,
  });

  recordSubscriptionEvent(tenantId, {
    eventType: 'subscription_change',
    fromStatus,
    toStatus,
    fromPlan,
    toPlan,
    actorId,
    source,
    externalRef,
    note,
  });

  logAudit(tenantId, actorId, 'subscription_change', 'tenant', tenantId, {
    fromStatus,
    toStatus,
    fromPlan,
    toPlan,
    source,
  });

  return getDb().prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
}

export function createSubscriptionCheckout(tenantId, user, { planId, idempotencyKey } = {}) {
  const cfg = getPaymentGatewayConfig();
  if (!cfg.checkoutEnabled) {
    const err = new Error('Subscription checkout is not available');
    err.status = 501;
    err.code = 'CHECKOUT_NOT_AVAILABLE';
    throw err;
  }

  const nextPlan = normalizePlanId(planId);
  if (!PLAN_DEFINITIONS[nextPlan]) {
    const err = new Error('Invalid plan');
    err.status = 400;
    throw err;
  }

  const key = idempotencyKey ? String(idempotencyKey).trim() : null;
  if (key) {
    const existing = getDb().prepare(
      'SELECT * FROM billing_transactions WHERE idempotency_key = ? AND tenant_id = ?',
    ).get(key, tenantId);
    if (existing) {
      return formatCheckoutResponse(existing, cfg);
    }
  }

  const amountCents = SANDBOX_PLAN_AMOUNTS_INR[nextPlan] ?? 0;
  const txId = nanoid(14);
  const orderId = `order_${nanoid(10)}`;
  getDb().prepare(`
    INSERT INTO billing_transactions (
      id, tenant_id, kind, plan_id, amount_cents, currency, status, provider,
      external_order_id, idempotency_key
    ) VALUES (?, ?, 'subscription_checkout', ?, ?, 'INR', ?, ?, ?, ?)
  `).run(
    txId,
    tenantId,
    nextPlan,
    amountCents,
    GATEWAY_STATUS.PENDING,
    cfg.provider,
    orderId,
    key,
  );

  recordSubscriptionEvent(tenantId, {
    eventType: 'checkout_created',
    fromPlan: normalizePlanId(getDb().prepare('SELECT plan FROM tenants WHERE id = ?').get(tenantId)?.plan),
    toPlan: nextPlan,
    actorId: user?.sub,
    source: 'checkout',
    externalRef: orderId,
  });

  const row = getDb().prepare('SELECT * FROM billing_transactions WHERE id = ?').get(txId);
  return formatCheckoutResponse(row, cfg);
}

function formatCheckoutResponse(row, cfg) {
  return {
    transactionId: row.id,
    orderId: row.external_order_id,
    planId: row.plan_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    mode: cfg.mode,
    message: cfg.mode === 'sandbox'
      ? 'Sandbox checkout — complete payment via verified webhook (no live charges).'
      : undefined,
  };
}

export function verifyRazorpayWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.CLINIC_RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: false, reason: 'webhook_secret_not_configured' };
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = String(signatureHeader).trim();
  if (provided.length !== expected.length) return { ok: false, reason: 'invalid_signature' };
  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}

export function processSubscriptionWebhook(provider, payload, { rawBody = '' } = {}) {
  const eventId = String(payload?.event_id || payload?.id || '').trim();
  if (!eventId) {
    const err = new Error('Missing event id');
    err.status = 400;
    throw err;
  }

  const db = getDb();
  const dedupe = db.prepare(
    'SELECT id FROM billing_webhook_events WHERE provider = ? AND external_event_id = ?',
  ).get(provider, eventId);
  if (dedupe) {
    return { ok: true, duplicate: true };
  }

  const whId = nanoid(12);
  db.prepare(`
    INSERT INTO billing_webhook_events (id, provider, external_event_id, payload_hash, result)
    VALUES (?, ?, ?, ?, 'processing')
  `).run(whId, provider, eventId, sha256Hex(rawBody || JSON.stringify(payload)));

  try {
    const result = applyWebhookPayload(provider, payload);
    db.prepare(`UPDATE billing_webhook_events SET result = ? WHERE id = ?`).run('ok', whId);
    return { ok: true, duplicate: false, ...result };
  } catch (err) {
    db.prepare(`UPDATE billing_webhook_events SET result = ? WHERE id = ?`).run(String(err.message || 'error'), whId);
    throw err;
  }
}

function applyWebhookPayload(provider, payload) {
  const eventType = String(payload?.event || payload?.event_type || '').toLowerCase();
  const payment = payload?.payload?.payment?.entity || payload?.payment || payload;
  const orderId = payment?.order_id || payload?.order_id;
  const paymentId = payment?.id || payload?.payment_id;
  const status = String(payment?.status || payload?.status || '').toLowerCase();

  const tx = orderId
    ? getDb().prepare('SELECT * FROM billing_transactions WHERE external_order_id = ?').get(orderId)
    : null;

  if (!tx) {
    if (eventType.includes('failed') || status === 'failed') {
      return { ignored: true, reason: 'unknown_order' };
    }
    const err = new Error('Unknown checkout order');
    err.status = 404;
    throw err;
  }

  const tenantId = tx.tenant_id;

  if (eventType.includes('failed') || status === 'failed') {
    getDb().prepare(`
      UPDATE billing_transactions SET status = ?, failure_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(GATEWAY_STATUS.FAILED, payment?.error_description || 'payment_failed', tx.id);
    transitionTenantSubscription(tenantId, null, {
      subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
      source: 'webhook',
      externalRef: paymentId || orderId,
      note: 'Payment failed',
    });
    return { tenantId, status: GATEWAY_STATUS.FAILED };
  }

  const paid = eventType.includes('captured') || status === 'captured' || status === 'paid';
  if (!paid) {
    return { ignored: true, eventType };
  }

  getDb().prepare(`
    UPDATE billing_transactions SET status = ?, external_payment_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(GATEWAY_STATUS.SUCCEEDED, paymentId || null, tx.id);

  transitionTenantSubscription(tenantId, null, {
    subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
    planId: tx.plan_id,
    source: 'webhook',
    externalRef: paymentId || orderId,
    note: 'Verified subscription payment',
  });

  return { tenantId, status: GATEWAY_STATUS.SUCCEEDED, planId: tx.plan_id };
}

/** Test/sandbox helper — builds signed webhook body for an order (never for production UI). */
export function buildSandboxWebhookPayload(orderId, paymentId = `pay_${nanoid(8)}`) {
  return {
    event: 'payment.captured',
    event_id: `evt_${nanoid(10)}`,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          status: 'captured',
        },
      },
    },
  };
}

export function listAvailablePlans() {
  return Object.values(PLAN_DEFINITIONS).map((p) => ({
    id: p.id,
    label: p.label,
    maxDoctors: p.maxDoctors,
    maxStaff: p.maxStaff,
    features: p.features,
    amountCentsInr: SANDBOX_PLAN_AMOUNTS_INR[p.id] ?? null,
  }));
}
