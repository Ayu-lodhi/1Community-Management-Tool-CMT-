const Redis = require('ioredis');
const { ENV } = require('./env.config.js');
const { logger } = require('../utils/logger.js');

const redisPubSub = ENV.REDIS_PUBSUB_URL ? new Redis(ENV.REDIS_PUBSUB_URL, {
  maxRetriesPerRequest: null, // Pub/Sub requires long-lived uninterrupted connection
  enableReadyCheck: true,
  lazyConnect: true
}) : null;

if (redisPubSub) {
  redisPubSub.on('error', (err) => {
    logger.error('Redis PubSub Client Error', { error: err.message });
  });
}

module.exports = { redisPubSub };

