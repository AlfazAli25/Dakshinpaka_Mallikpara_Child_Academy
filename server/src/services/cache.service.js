const { getRedisClient } = require('../config/redis');

const MEMORY_MAX_ENTRIES = Number(process.env.CACHE_MEMORY_MAX_ENTRIES || 500);

const memoryStore = new Map();

const trimMemoryStore = () => {
  while (memoryStore.size > MEMORY_MAX_ENTRIES) {
    const oldestKey = memoryStore.keys().next().value;
    if (!oldestKey) {
      break;
    }
    memoryStore.delete(oldestKey);
  }
};

const getFromMemory = (key) => {
  const item = memoryStore.get(key);
  if (!item) {
    return null;
  }

  if (item.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }

  return item.value;
};

const setToMemory = (key, value, ttlMs) => {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + Math.max(Number(ttlMs || 0), 1000)
  });
  trimMemoryStore();
};

const getJson = async (key) => {
  const redis = await getRedisClient();
  if (redis) {
    const value = await redis.get(key);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  return getFromMemory(key);
};

const setJson = async (key, value, ttlMs) => {
  const redis = await getRedisClient();
  const safeTtlMs = Math.max(Number(ttlMs || 0), 1000);
  if (redis) {
    await redis.set(key, JSON.stringify(value), 'PX', safeTtlMs);
    return;
  }

  setToMemory(key, value, safeTtlMs);
};

const del = async (key) => {
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }

  memoryStore.delete(key);
};

const clearAll = async () => {
  const redis = await getRedisClient();
  if (redis) {
    const prefix = String(process.env.REDIS_CACHE_PREFIX || 'sms:api:');
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return;
  }

  memoryStore.clear();
};

module.exports = {
  getJson,
  setJson,
  del,
  clearAll
};
