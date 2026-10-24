import { getTenantById } from '../tenantContext.js';
import { canWriteTenantSubscription, normalizeSubscriptionStatus } from '../modules/identity/subscription.js';

/** Block mutating API calls when subscription is past_due / canceled / suspended. */
export function requireTenantWrite(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const tenantId = req.user?.tenantId;
  if (!tenantId) return next();

  const tenant = getTenantById(tenantId);
  if (!tenant) return next();

  const sub = normalizeSubscriptionStatus(tenant.subscription_status);
  if (!canWriteTenantSubscription(sub)) {
    return res.status(403).json({
      error: 'Your subscription is read-only. Update billing to continue making changes.',
      code: 'SUBSCRIPTION_READ_ONLY',
      subscriptionStatus: sub,
    });
  }
  next();
}
