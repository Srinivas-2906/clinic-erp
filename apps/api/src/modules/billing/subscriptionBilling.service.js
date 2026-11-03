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
import { createRazorpayClient } from './razorpayClient.js';
import { assertRazorpayPlanConfigured } from './razorpayPlanMap.js';
import { notifySubscriptionBillingEvent } from './subscriptionBillingEmail.js';

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

export async function createSubscriptionCheckout(tenantId, user, { planId, idempotencyKey } = {}) {
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
  let orderId = `order_${nanoid(10)}`;
  let externalSubscriptionId = null;
  let checkoutShortUrl = null;

  if (cfg.mode === 'test') {
    const rpPlanId = assertRazorpayPlanConfigured(nextPlan);
    const client = createRazorpayClient({
      keyId: process.env.CLINIC_RAZORPAY_KEY_ID,
      keySecret: process.env.CLINIC_RAZORPAY_KEY_SECRET,
    });
    const sub = await client.createSubscription({
      plan_id: rpPlanId,
      total_count: 12,
      customer_notify: 1,
      notes: { tenant_id: tenantId, clinic_plan_id: nextPlan },
    });
    externalSubscriptionId = sub.id;
    orderId = sub.id;
    checkoutShortUrl = sub.short_url || null;
    upsertProviderSubscription(tenantId, {
      externalSubscriptionId,
      externalPlanId: rpPlanId,
      providerStatus: sub.status || 'created',
    });
  }

  getDb().prepare(`
    INSERT INTO billing_transactions (
      id, tenant_id, kind, plan_id, amount_cents, currency, status, provider,
      external_order_id, external_subscription_id, idempotency_key
    ) VALUES (?, ?, 'subscription_checkout', ?, ?, 'INR', ?, ?, ?, ?, ?)
  `).run(
    txId,
    tenantId,
    nextPlan,
    amountCents,
    GATEWAY_STATUS.PENDING,
    cfg.provider,
    orderId,
    externalSubscriptionId,
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
  const response = formatCheckoutResponse(row, cfg);
  if (checkoutShortUrl) response.shortUrl = checkoutShortUrl;
  if (externalSubscriptionId) response.subscriptionId = externalSubscriptionId;
  return response;
}

function upsertProviderSubscription(tenantId, {
  externalSubscriptionId,
  externalPlanId,
  providerStatus,
  currentPeriodEnd,
  graceUntil,
  canceledAt,
} = {}) {
  getDb().prepare(`
    INSERT INTO billing_provider_subscriptions (
      tenant_id, provider, external_subscription_id, external_plan_id, provider_status,
      current_period_end, grace_until, canceled_at, updated_at
    ) VALUES (?, 'razorpay', ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tenant_id) DO UPDATE SET
      external_subscription_id = COALESCE(excluded.external_subscription_id, billing_provider_subscriptions.external_subscription_id),
      external_plan_id = COALESCE(excluded.external_plan_id, billing_provider_subscriptions.external_plan_id),
      provider_status = COALESCE(excluded.provider_status, billing_provider_subscriptions.provider_status),
      current_period_end = COALESCE(excluded.current_period_end, billing_provider_subscriptions.current_period_end),
      grace_until = COALESCE(excluded.grace_until, billing_provider_subscriptions.grace_until),
      canceled_at = COALESCE(excluded.canceled_at, billing_provider_subscriptions.canceled_at),
      updated_at = datetime('now')
  `).run(
    tenantId,
    externalSubscriptionId || null,
    externalPlanId || null,
    providerStatus || null,
    currentPeriodEnd || null,
    graceUntil || null,
    canceledAt || null,
  );
}

export async function cancelProviderSubscription(tenantId) {
  const row = getDb().prepare(`
    SELECT external_subscription_id FROM billing_provider_subscriptions WHERE tenant_id = ?
  `).get(tenantId);
  const cfg = getPaymentGatewayConfig();
  if (row?.external_subscription_id && cfg.mode === 'test') {
    const client = createRazorpayClient({
      keyId: process.env.CLINIC_RAZORPAY_KEY_ID,
      keySecret: process.env.CLINIC_RAZORPAY_KEY_SECRET,
    });
    await client.cancelSubscription(row.external_subscription_id, false);
    upsertProviderSubscription(tenantId, {
      providerStatus: 'cancelled',
      canceledAt: new Date().toISOString(),
    });
  }
}

function formatCheckoutResponse(row, cfg) {
  return {
    transactionId: row.id,
    orderId: row.external_order_id,
    subscriptionId: row.external_subscription_id || undefined,
    planId: row.plan_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    mode: cfg.mode,
    keyId: cfg.keyId,
    message: cfg.mode === 'sandbox'
      ? 'Sandbox checkout — complete payment via verified webhook (no live charges).'
      : cfg.mode === 'test'
        ? 'Complete payment via Razorpay test checkout; activation requires verified webhook.'
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
  const subEntity = payload?.payload?.subscription?.entity;
  if (subEntity?.id) {
    return applySubscriptionEntityWebhook(subEntity, payload, eventType);
  }

  const payment = payload?.payload?.payment?.entity || payload?.payment || payload;
  const orderId = payment?.order_id || payload?.order_id;
  const paymentId = payment?.id || payload?.payment_id;
  const status = String(payment?.status || payload?.status || '').toLowerCase();
  const amountPaise = Number(payment?.amount ?? payload?.amount ?? 0) || null;
  const currency = String(payment?.currency || payload?.currency || 'INR').toUpperCase();

  const db = getDb();

  const tx = orderId
    ? db.prepare('SELECT * FROM billing_transactions WHERE external_order_id = ?').get(orderId)
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

  const applyFailed = () => {
    db.transaction(() => {
      const row = db.prepare('SELECT status FROM billing_transactions WHERE id = ?').get(tx.id);
      if (row.status === GATEWAY_STATUS.SUCCEEDED) {
        recordSubscriptionEvent(tenantId, {
          eventType: 'webhook_out_of_order',
          source: 'webhook',
          externalRef: paymentId || orderId,
          note: 'Failed payment event after success — recorded for reconciliation',
          payload: { eventType, status },
        });
        return;
      }
      if (row.status === GATEWAY_STATUS.FAILED) return;
      db.prepare(`
        UPDATE billing_transactions SET status = ?, failure_reason = ?, updated_at = datetime('now')
        WHERE id = ? AND status = ?
      `).run(GATEWAY_STATUS.FAILED, payment?.error_description || 'payment_failed', tx.id, GATEWAY_STATUS.PENDING);
      const after = db.prepare('SELECT status FROM billing_transactions WHERE id = ?').get(tx.id);
      if (after.status === GATEWAY_STATUS.FAILED) {
        transitionTenantSubscription(tenantId, null, {
          subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
          source: 'webhook',
          externalRef: paymentId || orderId,
          note: 'Payment failed',
        });
      }
    })();
  };

  const applyPaid = () => {
    if (amountPaise != null && tx.amount_cents > 0 && amountPaise !== tx.amount_cents) {
      const err = new Error('Payment amount mismatch');
      err.status = 400;
      err.code = 'AMOUNT_MISMATCH';
      throw err;
    }
    if (currency !== String(tx.currency || 'INR').toUpperCase()) {
      const err = new Error('Payment currency mismatch');
      err.status = 400;
      err.code = 'CURRENCY_MISMATCH';
      throw err;
    }

    let activated = false;
    db.transaction(() => {
      const row = db.prepare('SELECT status FROM billing_transactions WHERE id = ?').get(tx.id);
      if (row.status === GATEWAY_STATUS.SUCCEEDED) return;
      if (row.status === GATEWAY_STATUS.FAILED) {
        recordSubscriptionEvent(tenantId, {
          eventType: 'webhook_out_of_order',
          source: 'webhook',
          externalRef: paymentId || orderId,
          note: 'Capture after failure — requires reconciliation',
          payload: { eventType, status },
        });
        return;
      }
      const updated = db.prepare(`
        UPDATE billing_transactions SET status = ?, external_payment_id = ?, updated_at = datetime('now')
        WHERE id = ? AND status = ?
      `).run(GATEWAY_STATUS.SUCCEEDED, paymentId || null, tx.id, GATEWAY_STATUS.PENDING);
      if (updated.changes !== 1) return;
      transitionTenantSubscription(tenantId, null, {
        subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
        planId: tx.plan_id,
        source: 'webhook',
        externalRef: paymentId || orderId,
        note: 'Verified subscription payment',
      });
      activated = true;
    })();
    return activated;
  };

  if (eventType.includes('failed') || status === 'failed') {
    applyFailed();
    return { tenantId, status: GATEWAY_STATUS.FAILED };
  }

  const paid = eventType.includes('captured') || status === 'captured' || status === 'paid';
  if (!paid) {
    return { ignored: true, eventType };
  }

  const activated = applyPaid();
  return { tenantId, status: GATEWAY_STATUS.SUCCEEDED, planId: tx.plan_id, activated: activated !== false };
}

function applySubscriptionEntityWebhook(subEntity, payload, eventType) {
  const subId = subEntity.id;
  const db = getDb();
  const link = db.prepare(`
    SELECT tenant_id FROM billing_provider_subscriptions WHERE external_subscription_id = ?
  `).get(subId);
  const tenantFromNotes = subEntity.notes?.tenant_id;
  const tenantId = link?.tenant_id || tenantFromNotes;
  if (!tenantId) {
    return { ignored: true, reason: 'unknown_subscription' };
  }

  upsertProviderSubscription(tenantId, {
    externalSubscriptionId: subId,
    externalPlanId: subEntity.plan_id,
    providerStatus: subEntity.status,
    currentPeriodEnd: subEntity.current_end
      ? new Date(Number(subEntity.current_end) * 1000).toISOString()
      : null,
  });

  if (eventType.includes('cancel')) {
    transitionTenantSubscription(tenantId, null, {
      subscriptionStatus: SUBSCRIPTION_STATUS.CANCELED,
      source: 'webhook',
      externalRef: subId,
      note: 'Provider subscription cancelled',
    });
    void notifySubscriptionBillingEvent(tenantId, 'subscription_cancelled', { dedupeSuffix: subId });
    return { tenantId, status: 'cancelled' };
  }

  if (eventType.includes('halt') || eventType.includes('pending')) {
    transitionTenantSubscription(tenantId, null, {
      subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
      source: 'webhook',
      externalRef: subId,
      note: `Provider status: ${subEntity.status}`,
    });
    void notifySubscriptionBillingEvent(tenantId, 'payment_failed', { dedupeSuffix: subId });
    return { tenantId, status: SUBSCRIPTION_STATUS.PAST_DUE };
  }

  if (eventType.includes('activated') || eventType.includes('charged')) {
    const planNote = subEntity.notes?.clinic_plan_id;
    transitionTenantSubscription(tenantId, null, {
      subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
      planId: planNote || undefined,
      source: 'webhook',
      externalRef: subId,
      note: 'Provider subscription active',
    });
    const kind = eventType.includes('charged') ? 'renewal_confirmed' : 'subscription_activated';
    void notifySubscriptionBillingEvent(tenantId, kind, {
      planId: planNote,
      dedupeSuffix: payload?.event_id || subId,
    });
    return { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE };
  }

  return { ignored: true, eventType };
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
