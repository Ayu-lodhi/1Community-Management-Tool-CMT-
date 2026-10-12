const test = require('node:test');
const assert = require('node:assert/strict');
const { getHealth, checkRedisInstance } = require('../health.controller');
const { redisCache } = require('../../../core/config/redis-cache.client');
const { redisPubSub } = require('../../../core/config/redis-pubsub.client');
const { redisQueue } = require('../../../core/config/redis-queue.client');

test.after(() => {
  try { redisCache.disconnect(); } catch {}
  try { redisPubSub.disconnect(); } catch {}
  try { redisQueue.disconnect(); } catch {}
});

test('Health Check - checkRedisInstance returns ok on PONG and not-ok on failure', async () => {
  const healthyClient = {
    async ping() {
      return 'PONG';
    },
  };
  const unhealthyClient = {
    async ping() {
      throw new Error('Connection refused');
    },
  };
  const timeoutClient = {
    async ping() {
      await new Promise((r) => setTimeout(r, 3000));
      return 'PONG';
    },
  };

  assert.equal(await checkRedisInstance(healthyClient), 'ok');
  assert.equal(await checkRedisInstance(unhealthyClient), 'not-ok');
  assert.equal(await checkRedisInstance(timeoutClient), 'not-ok');
  assert.equal(await checkRedisInstance(null), 'not-ok');
});

test('Health Check - getHealth returns only ok/not-ok per component without exposing secrets', async () => {
  let responseStatus = 0;
  let responseJson = null;

  const mockReq = {};
  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await getHealth(mockReq, mockRes);

  assert.ok(responseStatus === 200 || responseStatus === 503);
  assert.ok(responseJson);
  assert.ok(['ok', 'degraded'].includes(responseJson.status));
  assert.ok(responseJson.components);

  // Strictly ok or not-ok
  const { mongodb, redis_cache, redis_pubsub, redis_queue } = responseJson.components;
  assert.ok(['ok', 'not-ok'].includes(mongodb));
  assert.ok(['ok', 'not-ok'].includes(redis_cache));
  assert.ok(['ok', 'not-ok'].includes(redis_pubsub));
  assert.ok(['ok', 'not-ok'].includes(redis_queue));

  // Verify no sensitive keys or internal IP/ports are leaked
  const jsonStr = JSON.stringify(responseJson);
  assert.equal(jsonStr.includes('6379'), false);
  assert.equal(jsonStr.includes('6380'), false);
  assert.equal(jsonStr.includes('6381'), false);
  assert.equal(jsonStr.includes('localhost'), false);
  assert.equal(jsonStr.includes('mongodb://'), false);
});
