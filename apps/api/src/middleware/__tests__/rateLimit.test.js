const test = require('node:test');
const assert = require('node:assert/strict');
const { globalLimiter, createUserLimiter } = require('../rateLimit.middleware');

test('rateLimit: in-memory fallback limits global requests', async (t) => {
  const req = { ip: '127.0.0.99', headers: {}, socket: { remoteAddress: '127.0.0.99' } };
  let statusCode = null;
  let responseData = null;
  const headers = {};

  const res = {
    setHeader: (name, val) => { headers[name] = val; },
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; }
      };
    }
  };

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await globalLimiter(req, res, next);
  assert.equal(nextCalled, true);
  assert.equal(headers['X-RateLimit-Limit'], 500);
  assert.ok(headers['X-RateLimit-Remaining'] <= 500);
});

test('rateLimit: createUserLimiter blocks requests beyond 5', async (t) => {
  const req = { ip: '127.0.0.100', headers: {}, socket: { remoteAddress: '127.0.0.100' } };
  let statusCode = null;
  let responseData = null;

  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; }
      };
    }
  };

  // Run 5 allowed requests
  for (let i = 0; i < 5; i++) {
    let nextCalled = false;
    await createUserLimiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }

  // 6th request must be blocked with 429
  let nextCalled6 = false;
  await createUserLimiter(req, res, () => { nextCalled6 = true; });
  assert.equal(nextCalled6, false);
  assert.equal(statusCode, 429);
  assert.equal(responseData.success, false);
});
