const Redis = require('ioredis');
let ENV = {};
try {
  ENV = require('./env.config').ENV || {};
} catch (_) {}
let logger = console;
try {
  logger = require('../utils/logger').logger || console;
} catch (_) {}

let redisPubSub = null;
if (ENV.REDIS_PUBSUB_URL) {
  try {
    redisPubSub = new Redis(ENV.REDIS_PUBSUB_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisPubSub.on('error', (err) => {
      if (logger && typeof logger.error === 'function') {
        logger.error('Redis PubSub Client Error', { error: err.message });
      }
    });
  } catch (_) {}
}

module.exports = { redisPubSub };
