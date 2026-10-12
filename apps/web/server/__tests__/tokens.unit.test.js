const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('web server auth.tokens throws 500 when JWT_ACCESS_SECRET is missing', () => {
  const origAccess = process.env.JWT_ACCESS_SECRET;
  delete process.env.JWT_ACCESS_SECRET;
  try {
    delete require.cache[require.resolve('../modules/auth/auth.tokens')];
    const tokens = require('../modules/auth/auth.tokens');
    assert.throws(
      () => tokens.sign({ _id: '123' }, 'access', '15m'),
      (err) => {
        assert.equal(err.status, 500);
        assert.equal(err.message, 'Authentication service configuration error');
        assert.equal(err.message.includes('JWT_ACCESS_SECRET'), false);
        return true;
      }
    );
  } finally {
    process.env.JWT_ACCESS_SECRET = origAccess;
    delete require.cache[require.resolve('../modules/auth/auth.tokens')];
  }
});

test('web server auth.tokens throws 500 when JWT_REFRESH_SECRET is missing', () => {
  const origRefresh = process.env.JWT_REFRESH_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
  try {
    delete require.cache[require.resolve('../modules/auth/auth.tokens')];
    const tokens = require('../modules/auth/auth.tokens');
    assert.throws(
      () => tokens.sign({ _id: '123' }, 'refresh', '7d'),
      (err) => {
        assert.equal(err.status, 500);
        assert.equal(err.message, 'Authentication service configuration error');
        assert.equal(err.message.includes('JWT_REFRESH_SECRET'), false);
        return true;
      }
    );
  } finally {
    process.env.JWT_REFRESH_SECRET = origRefresh;
    delete require.cache[require.resolve('../modules/auth/auth.tokens')];
  }
});

test('web server auth.tokens rejects token signed with old fallback string', () => {
  delete require.cache[require.resolve('../modules/auth/auth.tokens')];
  const tokens = require('../modules/auth/auth.tokens');
  const dummyPlaceholder = 'tbi_placeholder_fallback_secret_32_characters';
  const token = jwt.sign({ sub: 'user123', purpose: 'access' }, dummyPlaceholder, { algorithm: 'HS256' });
  assert.throws(
    () => tokens.verify(token, 'access'),
    /invalid signature/
  );
});
