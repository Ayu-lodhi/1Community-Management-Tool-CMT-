const Redis = require('ioredis');
const { ENV } = require('./env.config.js');
const { logger } = require('../utils/logger.js');

const redisQueue = ENV.REDIS_QUEUE_URL ? new Redis(ENV.REDIS_QUEUE_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: true,
  lazyConnect: true
}) : null;

if (redisQueue) {
  redisQueue.on('error', (err) => {
    logger.error('Redis Queue Client Error', { error: err.message });
  });
}

module.exports = { redisQueue };
