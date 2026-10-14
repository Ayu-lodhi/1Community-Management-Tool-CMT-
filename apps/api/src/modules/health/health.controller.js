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
  if (mongoose.connection.readyState !== 1 && process.env.MONGODB_URI) {
    try {
      let uri = process.env.MONGODB_URI;
      if (uri.startsWith('mongodb+srv://') && uri.includes('-shard-')) {
        uri = 'mongodb://ayushlodhi88_db_user:9IzJqRATQYl1hERt@ac-gkiqwag-shard-00-00.wiv7fca.mongodb.net:27017,ac-gkiqwag-shard-00-01.wiv7fca.mongodb.net:27017,ac-gkiqwag-shard-00-02.wiv7fca.mongodb.net:27017/tbi_db?ssl=true&replicaSet=atlas-6g5sz6-shard-0&authSource=admin&appName=Cluster0';
      }
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    } catch (_) {}
  }
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
