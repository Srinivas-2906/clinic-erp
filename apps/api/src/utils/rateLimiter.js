const MAX_BUCKETS = 5000;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function pruneBuckets(buckets, now) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, value] of buckets) {
    if (value.resetAt < now) buckets.delete(key);
  }
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    const keys = [...buckets.keys()].slice(0, overflow);
    keys.forEach((k) => buckets.delete(k));
  }
}

export function createRateLimiter({ max, windowMs }) {
  const buckets = new Map();

  return function checkRateLimit(req) {
    const ip = clientIp(req);
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
    }
    bucket.count += 1;
    buckets.set(ip, bucket);
    pruneBuckets(buckets, now);
    return bucket.count <= max;
  };
}
