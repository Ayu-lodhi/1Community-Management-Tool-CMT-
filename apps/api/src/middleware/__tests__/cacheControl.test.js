const test = require('node:test');
const assert = require('node:assert/strict');
const { noCache, publicCache } = require('../cacheControl.middleware');

test('cacheControl: noCache sets strict no-store headers', (t) => {
  const headers = {};
  const res = {
    setHeader: (name, val) => { headers[name] = val; },
  };
  let nextCalled = false;
  noCache({}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(headers['Cache-Control'], 'no-store, no-cache, must-revalidate, proxy-revalidate');
  assert.equal(headers['Pragma'], 'no-cache');
  assert.equal(headers['Expires'], '0');
});

test('cacheControl: publicCache sets public cache on unauthenticated requests', (t) => {
  const headers = {};
  const res = {
    setHeader: (name, val) => { headers[name] = val; },
  };
  let nextCalled = false;
  publicCache(60)({ headers: {} }, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=120');
});

test('cacheControl: publicCache forces no-store if Authorization header is present', (t) => {
  const headers = {};
  const res = {
    setHeader: (name, val) => { headers[name] = val; },
  };
  let nextCalled = false;
  publicCache(60)({ headers: { authorization: 'Bearer token123' } }, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(headers['Cache-Control'], 'no-store, no-cache, must-revalidate, proxy-revalidate');
});
