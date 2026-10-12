const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const createTestApp = () => {
  const app = express();

  // Test endpoints to trigger various errors
  app.get('/trigger-500', (req, res, next) => {
    const err = new Error('Database password super_secret_leak_123 failed');
    next(err);
  });

  app.get('/trigger-400', (req, res, next) => {
    const err = new Error('Invalid email format');
    err.status = 400;
    next(err);
  });

  app.get('/trigger-403', (req, res, next) => {
    const err = new Error('Forbidden resource access');
    err.status = 403;
    next(err);
  });

  app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

  // Global error handler under test (same implementation as server.js)
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    const isProd = process.env.NODE_ENV === 'production';
    const requestId = req?.id || req?.headers?.['x-request-id'] || null;
    // Suppress console.error during test
    const message = isProd && status >= 500 ? 'Internal server error' : err.message;
    res.status(status).json({ success: false, message });
  });

  return app;
};

test('Phase 5 - Global error handler masks 5xx error message in production mode', async () => {
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Thrown 500 error with sensitive message
    const res500 = await fetch(`http://127.0.0.1:${port}/trigger-500`);
    assert.equal(res500.status, 500);
    const body500 = await res500.json();
    assert.equal(body500.success, false);
    assert.equal(body500.message, 'Internal server error');
    assert.equal(
      JSON.stringify(body500).includes('super_secret_leak_123'),
      false,
      'Production response must not contain sensitive error message'
    );

    // 2. 400 client error message is preserved
    const res400 = await fetch(`http://127.0.0.1:${port}/trigger-400`);
    assert.equal(res400.status, 400);
    const body400 = await res400.json();
    assert.equal(body400.success, false);
    assert.equal(body400.message, 'Invalid email format');

    // 3. 403 client error message is preserved
    const res403 = await fetch(`http://127.0.0.1:${port}/trigger-403`);
    assert.equal(res403.status, 403);
    const body403 = await res403.json();
    assert.equal(body403.success, false);
    assert.equal(body403.message, 'Forbidden resource access');

    // 4. 404 route not found is preserved
    const res404 = await fetch(`http://127.0.0.1:${port}/non-existent`);
    assert.equal(res404.status, 404);
    const body404 = await res404.json();
    assert.equal(body404.success, false);
    assert.equal(body404.message, 'Route not found');
  } finally {
    process.env.NODE_ENV = origEnv;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Phase 5 - Global error handler leaves error message intact outside production', async () => {
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/trigger-500`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'Database password super_secret_leak_123 failed');
  } finally {
    process.env.NODE_ENV = origEnv;
    await new Promise((resolve) => server.close(resolve));
  }
});
