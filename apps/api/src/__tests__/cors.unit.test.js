const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

test('CORS configuration on real server.js', async (t) => {
  let initialEnv;
  let testServer;
  let baseUrl;

  before(async () => {
    initialEnv = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      REDIS_CACHE_URL: process.env.REDIS_CACHE_URL,
      REDIS_PUBSUB_URL: process.env.REDIS_PUBSUB_URL,
      REDIS_QUEUE_URL: process.env.REDIS_QUEUE_URL,
    };

    process.env.NODE_ENV = 'test';
    process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
    process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
    process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com, https://admin.example.com';

    delete require.cache[require.resolve('../server')];
    const app = require('../server');

    testServer = app.listen(0);
    const port = testServer.address().port;
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  after(async () => {
    if (testServer) {
      if (typeof testServer.closeAllConnections === 'function') {
        testServer.closeAllConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
    try {
      const { closeQueues } = require('../core/queues/queue.service');
      await closeQueues();
    } catch (_) {}
    for (const [key, val] of Object.entries(initialEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    delete require.cache[require.resolve('../server')];
  });

  let caseEnv;
  beforeEach(() => {
    caseEnv = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      VERCEL: process.env.VERCEL,
      VERCEL_PROJECT_NAME: process.env.VERCEL_PROJECT_NAME,
      VERCEL_URL: process.env.VERCEL_URL,
      FRONTEND_URL: process.env.FRONTEND_URL,
      CLIENT_URL: process.env.CLIENT_URL,
    };
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(caseEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  await t.test('(a) no Origin: request passes untouched without CORS headers', async () => {
    const res = await fetch(baseUrl, {
      headers: { Connection: 'close' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  await t.test('(b) exact ALLOWED_ORIGINS match gets matching Access-Control-Allow-Origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com, https://admin.example.com';
    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://allowed.example.com', Connection: 'close' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://allowed.example.com');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('(c) unknown origin: status is not 500 and no Access-Control-Allow-Origin header', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com';
    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://evil.example.com', Connection: 'close' },
    });
    assert.notStrictEqual(res.status, 500);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  await t.test('(d) an https://x.vercel.app origin not in the list gets no header', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com';
    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://x.vercel.app', Connection: 'close' },
    });
    assert.notStrictEqual(res.status, 500);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  await t.test('(e) http://localhost:3000 gets no header when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;
    const origFrontend = process.env.FRONTEND_URL;
    const origClient = process.env.CLIENT_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.CLIENT_URL;
    try {
      const res = await fetch(baseUrl, {
        headers: { Origin: 'http://localhost:3000', Connection: 'close' },
      });
      // status is irrelevant here: with NODE_ENV=production and no Redis the global limiter returns 500; this case only checks CORS headers.
      assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
    } finally {
      if (origFrontend) process.env.FRONTEND_URL = origFrontend;
      if (origClient) process.env.CLIENT_URL = origClient;
    }
  });

  await t.test('(f) the same origin is allowed when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOWED_ORIGINS;
    const res = await fetch(baseUrl, {
      headers: { Origin: 'http://localhost:3000', Connection: 'close' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('(g) VERCEL: external domain starting with project prefix (e.g. evil.com) is rejected', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_PROJECT_NAME = 'tbi-portal';
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CLIENT_URL;
    delete process.env.FRONTEND_URL;

    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://tbi-portal-evil.com', Connection: 'close' },
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  await t.test('(h) VERCEL: legitimate vercel preview domain matching project is allowed', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_PROJECT_NAME = 'tbi-portal';
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CLIENT_URL;
    delete process.env.FRONTEND_URL;

    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://tbi-portal-git-feat-team.vercel.app', Connection: 'close' },
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://tbi-portal-git-feat-team.vercel.app');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });
});
