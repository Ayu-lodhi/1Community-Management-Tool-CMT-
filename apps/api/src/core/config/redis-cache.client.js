const Redis = require('ioredis');
const { ENV } = require('./env.config.js');
const { logger } = require('../utils/logger.js');

const redisCache = ENV.REDIS_CACHE_URL ? new Redis(ENV.REDIS_CACHE_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
}) : null;

if (redisCache) {
  redisCache.on('error', (err) => {
    logger.error('Redis Cache Client Error', { error: err.message });
  });
}

module.exports = { redisCache };
