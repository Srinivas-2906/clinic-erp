import { getTenantById } from '../tenantContext.js';
import { canAccessTenantSubscription, normalizeSubscriptionStatus } from '../modules/identity/subscription.js';

export function requireLiveTenant(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant access required' });
  }

  const tenant = getTenantById(tenantId);
  if (!tenant) {
    return res.status(403).json({ error: 'Clinic workspace not found' });
  }
  if (tenant.status !== 'active') {
    return res.status(403).json({ error: 'Clinic workspace is not active' });
  }

  const sub = normalizeSubscriptionStatus(tenant.subscription_status);
  if (!canAccessTenantSubscription(sub)) {
    return res.status(403).json({
      error: 'Clinic subscription is inactive',
      code: 'SUBSCRIPTION_INACTIVE',
      subscriptionStatus: sub,
    });
  }

  next();
}
