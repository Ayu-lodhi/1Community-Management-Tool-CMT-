const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../admin/admin.model');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const secret = 'auth-purpose-test-secret-not-for-production';

test('login tokens enforce purpose on protected HTTP routes', async (t) => {
  const environment = {
    JWT_SECRET: secret,
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  };
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const user = {
    _id: '111111111111111111111111',
    email: 'fixture@example.test',
    name: 'Fixture user',
    role: ROLES.T3_EXECUTIVE,
    isActive: true,
    password: await bcrypt.hash('Test-only-password1!', 4),
  };
  let currentUser = user;
  t.mock.method(User, 'findOne', ({ email }) => ({
    select: async () => email === user.email ? user : null,
  }));
  const lookup = t.mock.method(User, 'findById', (id) => ({
    select: async () => id === user._id ? currentUser : null,
  }));

  const { protect, restrictTo } = require('../auth.middleware');
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../auth.routes'));
  app.get('/role-protected', protect, restrictTo(ROLES.T3_EXECUTIVE), (req, res) => {
    res.json({ sub: req.user.sub, role: req.user.role });
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (token, path = '/auth/me') => fetch(base + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const response = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'Test-only-password1!' }),
  });
  assert.equal(response.status, 200);
  const { data: tokens } = await response.json();

  await t.test('issues distinct signed purposes with the configured lifetimes', () => {
    const access = jwt.verify(tokens.accessToken, secret);
    const refresh = jwt.verify(tokens.refreshToken, secret);
    assert.equal(access.purpose, 'access');
    assert.equal(refresh.purpose, 'refresh');
    assert.equal(access.sub, user._id);
    assert.equal(refresh.sub, user._id);
    assert.equal(access.exp - access.iat, 900);
    assert.equal(refresh.exp - refresh.iat, 604800);
  });

  await t.test('accepts login-issued access tokens on protected routes', async () => {
    const me = await request(tokens.accessToken);
    assert.equal(me.status, 200);
    assert.equal((await me.json()).data._id, user._id);
    assert.equal((await request(tokens.accessToken, '/role-protected')).status, 200);
  });

  await t.test('rejects login-issued refresh tokens before querying the account', async () => {
    const calls = lookup.mock.callCount();
    assert.equal((await request(tokens.refreshToken)).status, 401);
    assert.equal((await request(tokens.refreshToken, '/role-protected')).status, 401);
    assert.equal(lookup.mock.callCount(), calls);
  });

  await t.test('rejects missing, legacy, unknown-purpose, expired and invalid credentials', async () => {
    const invalidTokens = [
      undefined,
      'not-a-jwt',
      jwt.sign({ sub: user._id, role: ROLES.T3_EXECUTIVE }, secret),
      jwt.sign({ sub: user._id, purpose: 'unknown' }, secret),
      jwt.sign({ sub: user._id, purpose: 'access' }, secret, { expiresIn: -1 }),
      jwt.sign({ sub: user._id, purpose: 'access' }, 'different-test-key'),
    ];
    // Editing the refresh payload cannot turn it into a signed access token.
    const parts = tokens.refreshToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
    parts[1] = Buffer.from(JSON.stringify({ ...payload, purpose: 'access' })).toString('base64url');
    invalidTokens.push(parts.join('.'));
    const calls = lookup.mock.callCount();
    for (const token of invalidTokens) {
      assert.equal((await request(token)).status, 401);
    }
    assert.equal(lookup.mock.callCount(), calls);
  });

  await t.test('still rejects inactive/deleted accounts and uses the current database role', async () => {
    currentUser = { ...user, isActive: false };
    assert.equal((await request(tokens.accessToken)).status, 401);
    currentUser = null;
    assert.equal((await request(tokens.accessToken)).status, 401);
    currentUser = { ...user, role: ROLES.T1_VOLUNTEER };
    assert.equal((await request(tokens.accessToken, '/role-protected')).status, 403);
  });
});
