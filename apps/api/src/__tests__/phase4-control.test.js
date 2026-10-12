process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_unit_tests_32chars';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const app = require('../server');
const { closeQueues } = require('../core/queues/queue.service');
const { redisCache } = require('../core/config/redis-cache.client');
const { redisPubSub } = require('../core/config/redis-pubsub.client');
const { redisQueue } = require('../core/config/redis-queue.client');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

const mongoose = require('mongoose');

test.after(async () => {
  if (server) {
    server.close();
  }
  try {
    await closeQueues();
    redisCache.disconnect();
    redisPubSub.disconnect();
    redisQueue.disconnect();
    await mongoose.disconnect();
  } catch {}
});

test('Phase 4 Control - /health returns status ok/not-ok per component and sets x-request-id', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.ok([200, 503].includes(res.status));

  // Request ID header must be returned on every response
  const requestId = res.headers.get('x-request-id');
  assert.ok(requestId, 'x-request-id header must be present');
  assert.match(requestId, /^[0-9a-f-]{10,}$/i);

  const data = await res.json();
  assert.ok(data);
  assert.ok(['ok', 'degraded'].includes(data.status));
  assert.ok(data.components);
  assert.ok(['ok', 'not-ok'].includes(data.components.mongodb));
  assert.ok(['ok', 'not-ok'].includes(data.components.redis_cache));
  assert.ok(['ok', 'not-ok'].includes(data.components.redis_pubsub));
  assert.ok(['ok', 'not-ok'].includes(data.components.redis_queue));
});

test('Phase 4 Control - /admin/queues requires admin authentication and rejects unauthenticated requests', async () => {
  const res = await fetch(`${baseUrl}/admin/queues`);
  // Must fail closed with 401 Unauthorized
  assert.equal(res.status, 401, 'Queue dashboard must never be publicly accessible');
  const data = await res.json();
  assert.equal(data.success, false);
});
