const { test } = require('node:test');
const assert = require('node:assert/strict');
const { restrictTo } = require('../modules/auth/auth.middleware');
const app = require('../server');

test('Security & Anti-Override: Role switching and impersonation routes do not exist (404)', async (t) => {
  const routesToTest = [
    { method: 'POST', path: '/api/v1/auth/switch-role' },
    { method: 'GET', path: '/api/v1/auth/switch-role' },
    { method: 'POST', path: '/api/v1/auth/demo' },
    { method: 'GET', path: '/api/v1/auth/demo' },
    { method: 'POST', path: '/api/v1/auth/impersonate' },
    { method: 'POST', path: '/api/v1/auth/demo-login' },
  ];

  let testServer;
  let baseUrl;

  testServer = app.listen(0);
  const port = testServer.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (const r of routesToTest) {
      await t.test(`${r.method} ${r.path} returns 404`, async () => {
        const res = await fetch(`${baseUrl}${r.path}`, {
          method: r.method,
          headers: { 'Content-Type': 'application/json', Connection: 'close' },
          body: r.method === 'POST' ? JSON.stringify({ targetRole: 'SUPER_ADMIN' }) : undefined,
        });
        assert.strictEqual(res.status, 404);
        const data = await res.json();
        assert.strictEqual(data.success, false);
      });
    }
  } finally {
    if (testServer) {
      if (typeof testServer.closeAllConnections === 'function') {
        testServer.closeAllConnections();
      }
      await new Promise((resolve) => testServer.close(resolve));
    }
  }
});

test('Security & Anti-Override: User role in request always comes from DB record and cannot be overridden', async (t) => {
  const adminGate = restrictTo('ADMIN', 'SUPER_ADMIN');

  await t.test('blocks T1_VOLUNTEER attempting x-role header override', async () => {
    let statusCode = null;
    let responseBody = null;
    let nextCalled = false;

    const req = {
      user: { id: 'user-1', role: 'T1_VOLUNTEER' },
      headers: { 'x-role': 'SUPER_ADMIN', 'x-user-role': 'ADMIN' },
      body: { role: 'SUPER_ADMIN' },
      query: { role: 'SUPER_ADMIN' },
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseBody = payload;
        return this;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    adminGate(req, res, next);

    assert.strictEqual(nextCalled, false, 'Next middleware must not be called');
    assert.strictEqual(statusCode, 403, 'Should reject with 403 Forbidden');
    assert.match(responseBody?.message, /Access denied/);
  });

  await t.test('blocks unauthenticated request regardless of role headers or payload overrides', async () => {
    let statusCode = null;
    let responseBody = null;
    let nextCalled = false;

    const req = {
      user: null,
      headers: { 'x-role': 'SUPER_ADMIN', authorization: 'Bearer spoofed' },
      body: { role: 'SUPER_ADMIN' },
      query: { role: 'SUPER_ADMIN' },
      cookies: { role: 'SUPER_ADMIN' },
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseBody = payload;
        return this;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    adminGate(req, res, next);

    assert.strictEqual(nextCalled, false, 'Next middleware must not be called');
    assert.strictEqual(statusCode, 401, 'Should reject with 401 Unauthorized');
  });

  await t.test('allows legitimate ADMIN without permitting role elevation from request body or headers', async () => {
    let nextCalled = false;

    const req = {
      user: { id: 'admin-1', role: 'ADMIN' },
      headers: { 'x-role': 'SUPER_ADMIN' },
      body: { role: 'SUPER_ADMIN' },
    };

    const res = {
      status() { return this; },
      json() { return this; },
    };

    const next = () => {
      nextCalled = true;
    };

    adminGate(req, res, next);

    assert.strictEqual(nextCalled, true, 'Legitimate admin is allowed');
    // Ensure req.user.role remains ADMIN and was not overwritten by headers or body
    assert.strictEqual(req.user.role, 'ADMIN');
  });
});

test('Security & Anti-Override: Login response identity boundary', async () => {
  const authService = require('../modules/auth/auth.service');
  assert.ok(typeof authService.login === 'function', 'authService.login must exist');
  assert.strictEqual(authService.switchRole, undefined, 'No switchRole method on authService');
  assert.strictEqual(authService.impersonate, undefined, 'No impersonate method on authService');
  assert.strictEqual(authService.demoLogin, undefined, 'No demoLogin method on authService');
});
