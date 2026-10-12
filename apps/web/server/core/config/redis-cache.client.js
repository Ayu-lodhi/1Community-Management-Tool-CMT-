const Redis = require('ioredis');
let ENV = {};
try {
  ENV = require('./env.config').ENV || {};
} catch (_) {}
let logger = console;
try {
  logger = require('../utils/logger').logger || console;
} catch (_) {}

let redisCache = null;
if (ENV.REDIS_CACHE_URL) {
  try {
    redisCache = new Redis(ENV.REDIS_CACHE_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisCache.on('error', (err) => {
      if (logger && typeof logger.error === 'function') {
        logger.error('Redis Cache Client Error', { error: err.message });
      }
    });
  } catch (_) {}
}

module.exports = { redisCache };
