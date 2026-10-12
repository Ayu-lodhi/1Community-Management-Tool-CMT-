const test = require('node:test');
const assert = require('node:assert/strict');
const { requestIdMiddleware } = require('../requestId.middleware');

test('Request ID Middleware - generates a unique UUID when header is absent', () => {
  const req = { headers: {} };
  const resHeaders = {};
  const res = {
    setHeader(name, val) {
      resHeaders[name] = val;
    },
  };

  let nextCalled = false;
  requestIdMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.ok(req.id);
  assert.equal(resHeaders['x-request-id'], req.id);
  assert.match(req.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('Request ID Middleware - preserves valid incoming x-request-id', () => {
  const incoming = 'client-provided-trace-id-12345';
  const req = { headers: { 'x-request-id': incoming } };
  const resHeaders = {};
  const res = {
    setHeader(name, val) {
      resHeaders[name] = val;
    },
  };

  requestIdMiddleware(req, res, () => {});

  assert.equal(req.id, incoming);
  assert.equal(resHeaders['x-request-id'], incoming);
});
