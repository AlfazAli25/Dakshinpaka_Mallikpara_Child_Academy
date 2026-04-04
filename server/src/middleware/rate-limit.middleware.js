const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 180);
const ENABLE_RATE_LIMIT = String(process.env.ENABLE_RATE_LIMIT || 'true').toLowerCase() !== 'false';

const requestBuckets = new Map();

const now = () => Date.now();

const cleanupExpiredBuckets = (currentTime) => {
  for (const [key, entry] of requestBuckets.entries()) {
    if (entry.resetAt <= currentTime) {
      requestBuckets.delete(key);
    }
  }
};

const buildKey = (req) => {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
  return `${ip}:${req.method}`;
};

const rateLimitMiddleware = (req, res, next) => {
  if (!ENABLE_RATE_LIMIT) {
    next();
    return;
  }

  const currentTime = now();
  if (requestBuckets.size > 5000) {
    cleanupExpiredBuckets(currentTime);
  }

  const key = buildKey(req);
  const existing = requestBuckets.get(key);
  if (!existing || existing.resetAt <= currentTime) {
    requestBuckets.set(key, {
      count: 1,
      resetAt: currentTime + WINDOW_MS
    });

    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(MAX_REQUESTS - 1, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((currentTime + WINDOW_MS) / 1000)));
    next();
    return;
  }

  existing.count += 1;
  const remaining = Math.max(MAX_REQUESTS - existing.count, 0);
  res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));

  if (existing.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', String(Math.ceil((existing.resetAt - currentTime) / 1000)));
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again shortly.'
    });
    return;
  }

  next();
};

module.exports = {
  rateLimitMiddleware
};
