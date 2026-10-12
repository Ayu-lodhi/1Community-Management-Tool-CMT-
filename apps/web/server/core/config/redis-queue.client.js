const Redis = require('ioredis');
let ENV = {};
try {
  ENV = require('./env.config').ENV || {};
} catch (_) {}
let logger = console;
try {
  logger = require('../utils/logger').logger || console;
} catch (_) {}

let redisQueue = null;
if (ENV.REDIS_QUEUE_URL) {
  try {
    redisQueue = new Redis(ENV.REDIS_QUEUE_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisQueue.on('error', (err) => {
      if (logger && typeof logger.error === 'function') {
        logger.error('Redis Queue Client Error', { error: err.message });
      }
    });
  } catch (_) {}
}

module.exports = { redisQueue };
