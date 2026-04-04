const DEFAULT_CACHE_TTL_MS = Number(process.env.API_CACHE_TTL_MS || 10000);
const MAX_CACHE_ENTRIES = Number(process.env.API_CACHE_MAX_ENTRIES || 400);
const MAX_CACHEABLE_RESPONSE_SIZE = Number(process.env.API_CACHE_MAX_BYTES || 1024 * 1024);
const ENABLE_API_CACHE = String(process.env.ENABLE_API_CACHE || 'true').toLowerCase() !== 'false';

const cacheStore = new Map();

const shouldBypassCache = (req) => {
  if (!ENABLE_API_CACHE) {
    return true;
  }

  if (req.method !== 'GET') {
    return true;
  }

  const noStoreHeader = String(req.headers['cache-control'] || '').toLowerCase();
  if (noStoreHeader.includes('no-store')) {
    return true;
  }

  const path = String(req.originalUrl || '').toLowerCase();

  // Skip highly dynamic endpoints where stale reads are risky.
  if (
    path.includes('/auth/') ||
    path.includes('/notifications') ||
    path.includes('/payments') ||
    path.includes('/webhook')
  ) {
    return true;
  }

  return false;
};

const invalidateApiCache = () => {
  cacheStore.clear();
};

const buildCacheKey = (req) => {
  const authToken = String(req.headers.authorization || '').slice(0, 120);
  return `${req.method}:${req.originalUrl}:token:${authToken}`;
};

const trimOldestEntries = () => {
  while (cacheStore.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cacheStore.delete(oldestKey);
  }
};

const responseCacheMiddleware = (req, res, next) => {
  if (!ENABLE_API_CACHE) {
    next();
    return;
  }

  if (req.method !== 'GET') {
    invalidateApiCache();
    next();
    return;
  }

  if (shouldBypassCache(req)) {
    next();
    return;
  }

  const key = buildCacheKey(req);
  const cached = cacheStore.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('X-API-Cache', 'HIT');
    res.status(cached.statusCode).json(cached.payload);
    return;
  }

  if (cached) {
    cacheStore.delete(key);
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const statusCode = res.statusCode || 200;

    if (statusCode >= 200 && statusCode < 300) {
      const payloadString = JSON.stringify(payload);
      if (Buffer.byteLength(payloadString, 'utf8') <= MAX_CACHEABLE_RESPONSE_SIZE) {
        cacheStore.set(key, {
          statusCode,
          payload,
          expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS
        });
        trimOldestEntries();
      }
    }

    res.setHeader('X-API-Cache', 'MISS');
    return originalJson(payload);
  };

  next();
};

module.exports = {
  responseCacheMiddleware,
  invalidateApiCache
};
