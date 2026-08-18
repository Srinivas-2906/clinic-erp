const ALLOWED_ORIGINS = new Set([
  'http://localhost:5185',
  'http://127.0.0.1:5185',
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (process.env.NODE_ENV !== 'production') {
    // Allow LAN dev: http://192.168.x.x:5185
    try {
      const u = new URL(origin);
      if (u.port === '5185' || u.port === '4173') return true;
    } catch { /* ignore */ }
  }
  if (origin.endsWith('.kaana.in') || origin.includes('.run.app')) return true;
  return false;
}

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-Slug');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
