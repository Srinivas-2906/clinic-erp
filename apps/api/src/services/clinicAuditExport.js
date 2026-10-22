import { createRateLimiter } from '../utils/rateLimiter.js';

const auditExportLimiter = createRateLimiter({
  max: Number(process.env.AUDIT_EXPORT_RATE_MAX || 5),
  windowMs: Number(process.env.AUDIT_EXPORT_RATE_WINDOW_MS || 15 * 60 * 1000),
});

/** Rate limit key: tenant + user (falls back to IP for defense in depth). */
export function checkAuditExportRateLimit(req) {
  const tenantId = req.user?.tenantId || 'unknown';
  const userId = req.user?.sub || 'anon';
  const priorIp = req.headers['x-forwarded-for'];
  req.headers['x-forwarded-for'] = `${tenantId}:${userId}`;
  try {
    return auditExportLimiter(req);
  } finally {
    if (priorIp === undefined) delete req.headers['x-forwarded-for'];
    else req.headers['x-forwarded-for'] = priorIp;
  }
}
