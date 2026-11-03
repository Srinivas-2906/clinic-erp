import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { SUBSCRIPTION_STATUS, normalizeSubscriptionStatus } from '../identity/subscription.js';
import { transitionTenantSubscription } from './subscriptionBilling.service.js';
import { notifySubscriptionBillingEvent } from './subscriptionBillingEmail.js';

const GRACE_DAYS = Number(process.env.CLINIC_SUBSCRIPTION_GRACE_DAYS || 7);
const TRIAL_WARN_DAYS = Number(process.env.CLINIC_TRIAL_WARN_DAYS || 3);

/**
 * Idempotent lifecycle sweep — safe to rerun (scheduler / internal POST).
 */
export function processSubscriptionLifecycle({ limit = 100 } = {}) {
  const db = getDb();
  const results = [];

  const trialing = db.prepare(`
    SELECT id, trial_ends_at, subscription_status FROM tenants
    WHERE subscription_status = 'trialing' AND trial_ends_at IS NOT NULL
    LIMIT ?
  `).all(Math.min(limit, 500));

  const now = Date.now();
  for (const row of trialing) {
    const end = new Date(row.trial_ends_at).getTime();
    if (!Number.isFinite(end)) continue;
    const daysLeft = Math.ceil((end - now) / (24 * 60 * 60 * 1000));
    if (daysLeft <= TRIAL_WARN_DAYS && daysLeft > 0) {
      void notifySubscriptionBillingEvent(row.id, 'trial_ending', { daysLeft });
      results.push({ tenantId: row.id, action: 'trial_warning_sent', daysLeft });
    }
    if (end <= now) {
      const graceUntil = new Date(end);
      graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
      db.prepare(`
        INSERT INTO billing_provider_subscriptions (tenant_id, provider, grace_until, updated_at)
        VALUES (?, 'razorpay', ?, datetime('now'))
        ON CONFLICT(tenant_id) DO UPDATE SET grace_until = excluded.grace_until, updated_at = datetime('now')
      `).run(row.id, graceUntil.toISOString());
      if (graceUntil.getTime() <= now) {
        transitionTenantSubscription(row.id, null, {
          subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
          source: 'lifecycle',
          note: 'Trial expired without paid subscription',
        });
        void notifySubscriptionBillingEvent(row.id, 'trial_expired', {});
        results.push({ tenantId: row.id, action: 'trial_expired_past_due' });
      } else {
        results.push({ tenantId: row.id, action: 'trial_in_grace', graceUntil: graceUntil.toISOString() });
      }
    }
  }

  const graceRows = db.prepare(`
    SELECT tenant_id, grace_until FROM billing_provider_subscriptions
    WHERE grace_until IS NOT NULL AND datetime(grace_until) <= datetime('now')
    LIMIT ?
  `).all(Math.min(limit, 200));

  for (const g of graceRows) {
    const tenant = db.prepare('SELECT subscription_status FROM tenants WHERE id = ?').get(g.tenant_id);
    if (normalizeSubscriptionStatus(tenant?.subscription_status) === SUBSCRIPTION_STATUS.TRIALING) {
      transitionTenantSubscription(g.tenant_id, null, {
        subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
        source: 'lifecycle',
        note: 'Grace period ended',
      });
      results.push({ tenantId: g.tenant_id, action: 'grace_ended_past_due' });
    }
  }

  return results;
}

export function getBillingDiagnosticsForTenant(tenantId) {
  const db = getDb();
  const provider = db.prepare(`
    SELECT external_subscription_id AS externalSubscriptionId, provider_status AS providerStatus,
           current_period_end AS currentPeriodEnd, grace_until AS graceUntil, canceled_at AS canceledAt
    FROM billing_provider_subscriptions WHERE tenant_id = ?
  `).get(tenantId);
  const openDisc = db.prepare(`
    SELECT kind, detail_json AS detailJson, created_at AS createdAt FROM billing_discrepancies
    WHERE tenant_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 5
  `).all(tenantId);
  return { provider, openDiscrepancies: openDisc };
}
