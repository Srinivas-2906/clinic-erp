/**
 * Subscription lifecycle (server-authoritative). No payment provider in M8 batch 1.
 */

export const SUBSCRIPTION_STATUS = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  SUSPENDED: 'suspended',
};

/** Can sign in and read clinic data */
export const ACCESSIBLE_SUBSCRIPTION_STATUSES = new Set([
  SUBSCRIPTION_STATUS.TRIALING,
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.PAST_DUE,
]);

/** Can create/update clinical records */
export const WRITABLE_SUBSCRIPTION_STATUSES = new Set([
  SUBSCRIPTION_STATUS.TRIALING,
  SUBSCRIPTION_STATUS.ACTIVE,
]);

const TRANSITIONS = {
  [SUBSCRIPTION_STATUS.TRIALING]: new Set([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.PAST_DUE,
    SUBSCRIPTION_STATUS.CANCELED,
    SUBSCRIPTION_STATUS.SUSPENDED,
  ]),
  [SUBSCRIPTION_STATUS.ACTIVE]: new Set([
    SUBSCRIPTION_STATUS.PAST_DUE,
    SUBSCRIPTION_STATUS.CANCELED,
    SUBSCRIPTION_STATUS.SUSPENDED,
  ]),
  [SUBSCRIPTION_STATUS.PAST_DUE]: new Set([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.CANCELED,
    SUBSCRIPTION_STATUS.SUSPENDED,
  ]),
  [SUBSCRIPTION_STATUS.CANCELED]: new Set([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.TRIALING,
  ]),
  [SUBSCRIPTION_STATUS.SUSPENDED]: new Set([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.TRIALING,
  ]),
};

export function normalizeSubscriptionStatus(raw) {
  const key = String(raw || SUBSCRIPTION_STATUS.ACTIVE).toLowerCase();
  return Object.values(SUBSCRIPTION_STATUS).includes(key) ? key : SUBSCRIPTION_STATUS.ACTIVE;
}

export function canAccessTenantSubscription(subscriptionStatus) {
  return ACCESSIBLE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(subscriptionStatus));
}

export function canWriteTenantSubscription(subscriptionStatus) {
  return WRITABLE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(subscriptionStatus));
}

export function assertSubscriptionTransition(from, to) {
  const current = normalizeSubscriptionStatus(from);
  const next = normalizeSubscriptionStatus(to);
  if (current === next) return next;
  const allowed = TRANSITIONS[current];
  if (!allowed?.has(next)) {
    const err = new Error(`Invalid subscription transition: ${current} → ${next}`);
    err.status = 400;
    err.code = 'INVALID_SUBSCRIPTION_TRANSITION';
    throw err;
  }
  return next;
}

/**
 * Plan change without billing (M8). Downgrades may exceed limits until next enforcement action.
 */
export function applyPlanChangeRules({ currentPlanId, nextPlanId }) {
  return {
    currentPlanId,
    nextPlanId,
    effectiveImmediately: true,
    billingNote: 'Plan change recorded; Razorpay sync not enabled',
  };
}
