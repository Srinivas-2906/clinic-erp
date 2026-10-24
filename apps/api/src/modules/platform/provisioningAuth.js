import { authMiddleware } from '../../middleware/auth.js';

/** Platform admin JWT or shared provisioning key (internal automation). */
export function requireProvisioningAuth(req, res, next) {
  const expected = process.env.CLINIC_PROVISIONING_API_KEY?.trim();
  const header = String(req.headers['x-clinic-provisioning-key'] || '').trim();
  if (expected) {
    if (header === expected) {
      req.provisioningAuth = 'api_key';
      return next();
    }
    return res.status(403).json({ error: 'Invalid provisioning credentials' });
  }
  return authMiddleware(req, res, () => {
    if (!req.user?.isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform provisioning access required' });
    }
    req.provisioningAuth = 'platform_admin';
    next();
  });
}

export function isPublicSignupEnabled() {
  if (process.env.CLINIC_PUBLIC_SIGNUP_ENABLED === '0') return false;
  if (process.env.CLINIC_PUBLIC_SIGNUP_ENABLED === '1') return true;
  return process.env.NODE_ENV !== 'production';
}
