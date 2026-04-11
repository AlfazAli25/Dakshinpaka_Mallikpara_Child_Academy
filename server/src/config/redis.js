const Redis = require('ioredis');
const { logInfo, logWarn } = require('../utils/logger');

let redisClient = null;
let redisEnabled = false;

const getRedisUrl = () => String(process.env.REDIS_URL || '').trim();

const getRedisConnectionOptions = () => ({
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableReadyCheck: true
});

const getRedisClient = async () => {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    redisEnabled = false;
    return null;
  }

  const client = new Redis(redisUrl, getRedisConnectionOptions());

  client.on('error', (error) => {
    logWarn('redis_error', {
      message: error?.message || 'Unknown redis error'
    });
  });

  try {
    await client.connect();
    redisClient = client;
    redisEnabled = true;
    logInfo('redis_connected', {});
    return redisClient;
  } catch (error) {
    redisEnabled = false;
    redisClient = null;
    logWarn('redis_connection_failed', {
      message: error?.message || 'Unable to connect to Redis'
    });
    try {
      client.disconnect();
    } catch (_error) {
      // no-op
    }
    return null;
  }
};

const isRedisEnabled = () => redisEnabled;

module.exports = {
  getRedisClient,
  getRedisConnectionOptions,
  isRedisEnabled
};
