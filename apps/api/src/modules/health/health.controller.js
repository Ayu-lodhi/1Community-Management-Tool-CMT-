const mongoose = require('mongoose');
const { redisCache } = require('../../core/config/redis-cache.client');
const { redisPubSub } = require('../../core/config/redis-pubsub.client');
const { redisQueue } = require('../../core/config/redis-queue.client');

/**
 * Ping Redis instance with a strict timeout.
 * Returns only 'ok' or 'not-ok' (Rule B.6: Never expose sensitive details).
 */
async function checkRedisInstance(client) {
  try {
    if (!client) return 'not-ok';
    const pingPromise = typeof client.ping === 'function' ? client.ping() : Promise.reject();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 1500)
    );
    const result = await Promise.race([pingPromise, timeoutPromise]);
    return result === 'PONG' ? 'ok' : 'not-ok';
  } catch {
    return 'not-ok';
  }
}

/**
 * Health check controller
 * Checks MongoDB and all three isolated Redis instances (cache, pubsub, queue).
 * Returns strictly ok/not-ok per component.
 */
async function getHealth(req, res) {
  const mongoOk = mongoose.connection.readyState === 1 ? 'ok' : 'not-ok';

  const [cacheOk, pubsubOk, queueOk] = await Promise.all([
    checkRedisInstance(redisCache),
    checkRedisInstance(redisPubSub),
    checkRedisInstance(redisQueue),
  ]);

  const components = {
    mongodb: mongoOk,
    redis_cache: cacheOk,
    redis_pubsub: pubsubOk,
    redis_queue: queueOk,
  };

  const allHealthy = Object.values(components).every((status) => status === 'ok');

  return res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    components,
  });
}

module.exports = {
  getHealth,
  checkRedisInstance,
};
