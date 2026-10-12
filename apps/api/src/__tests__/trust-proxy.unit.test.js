const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');

test('TRUST_PROXY configures Express trust proxy setting correctly', async (t) => {
  let originalTrustProxy;
  
  before(() => {
    originalTrustProxy = process.env.TRUST_PROXY;
    process.env.NODE_ENV = 'test';
    process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
    process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
    process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';
  });
  
  after(() => {
    if (originalTrustProxy) {
      process.env.TRUST_PROXY = originalTrustProxy;
    } else {
      delete process.env.TRUST_PROXY;
    }
  });

  await t.test('Default behavior (disabled)', async () => {
    delete process.env.TRUST_PROXY;
    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    assert.strictEqual(app.get('trust proxy'), false);
  });

  await t.test('With TRUST_PROXY enabled as boolean string', async () => {
    process.env.TRUST_PROXY = 'true';
    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    assert.strictEqual(app.get('trust proxy'), true);
  });

  await t.test('With TRUST_PROXY enabled as hop count', async () => {
    process.env.TRUST_PROXY = '2';
    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    assert.strictEqual(app.get('trust proxy'), 2);
  });
});
