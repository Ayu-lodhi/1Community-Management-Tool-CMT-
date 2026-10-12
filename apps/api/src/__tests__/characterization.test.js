const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'characterization_test_secret_32_characters';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const User = require('../modules/admin/admin.model');
const Team = require('../modules/teams/teams.model');
const tokens = require('../modules/auth/auth.tokens');
const path = require('node:path');
const { ROLES } = require(path.resolve(__dirname, '../../../../packages/shared-constants/roles.js'));

test('Characterization Suite: Baseline Auth & Error Handling', async (suite) => {
  let server;
  let baseUrl;
  let dummyUser;
  let hashedPassword;

  suite.before(async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    hashedPassword = await bcrypt.hash('CharacterizePassword123!', 4);
    dummyUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Baseline User',
      email: 'baseline@example.com',
      password: hashedPassword,
      role: ROLES.T3_EXECUTIVE,
      isActive: true,
      activeSessionId: null,
      lastActivity: new Date(),
    };

    const app = express();
    app.use(express.json());
    app.use('/api/v1/auth', require('../modules/auth/auth.routes'));

    // Custom test route to test requireTeam middleware
    const { requireTeam, protect } = require('../modules/auth/auth.middleware');
    app.get('/test/team-protected', protect, requireTeam('Engineering'), (req, res) => {
      res.json({ success: true, message: 'Welcome to Engineering' });
    });

    // 404 and Error Handler matching server.js
    app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({ success: false, message: err.message });
    });

    server = http.createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  suite.after(() => new Promise((resolve) => server.close(resolve)));

  await suite.test('1. Login success - validates status, body shape, and token claims', async (t) => {
    const userCopy = { ...dummyUser };
    t.mock.method(User, 'findOne', () => ({
      select: async () => userCopy,
    }));
    t.mock.method(User, 'findById', () => ({
      select: async () => userCopy,
    }));
    t.mock.method(User, 'findByIdAndUpdate', (id, update) => {
      if (update.$set?.activeSessionId) userCopy.activeSessionId = update.$set.activeSessionId;
      return userCopy;
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'baseline@example.com', password: 'CharacterizePassword123!' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Login successful');
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    assert.equal(body.data.user.email, 'baseline@example.com');

    // Decode token claims
    const decoded = jwt.decode(body.data.accessToken);
    assert.equal(decoded.sub, String(userCopy._id));
    assert.equal(decoded.purpose, 'access');
    assert.ok(decoded.authState);
    assert.ok(decoded.sid);
    assert.ok(decoded.exp);
    assert.ok(decoded.iat);
  });

  await suite.test('2. Single-session enforcement - second login invalidates the first session', async (t) => {
    let currentSessionId = null;
    const userCopy = { ...dummyUser };
    t.mock.method(User, 'findOne', () => ({
      select: async () => userCopy,
    }));
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ ...userCopy, activeSessionId: currentSessionId }),
      ...userCopy,
      activeSessionId: currentSessionId,
    }));
    t.mock.method(User, 'findByIdAndUpdate', (id, update) => {
      if (update.$set?.activeSessionId) {
        currentSessionId = update.$set.activeSessionId;
        userCopy.activeSessionId = currentSessionId;
      }
      return userCopy;
    });
    t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));

    // Login 1
    const res1 = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'baseline@example.com', password: 'CharacterizePassword123!' }),
    });
    const body1 = await res1.json();
    const token1 = body1.data.accessToken;

    // Login 2 overrides active session
    const res2 = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'baseline@example.com', password: 'CharacterizePassword123!' }),
    });
    const body2 = await res2.json();
    const token2 = body2.data.accessToken;

    // First token is now invalidated
    const test1 = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert.equal(test1.status, 401);
    const errBody = await test1.json();
    assert.match(errBody.message, /Session ended/);

    // Second token is valid
    const test2 = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    assert.equal(test2.status, 200);
  });

  await suite.test('3. Authenticated request with valid token succeeds', async (t) => {
    const userCopy = { ...dummyUser, activeSessionId: 'active-session-123' };
    t.mock.method(User, 'findById', () => ({
      select: async () => userCopy,
      ...userCopy,
    }));
    t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));

    const validToken = tokens.sign(userCopy, 'access', '15m', { sid: 'active-session-123' });
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.email, 'baseline@example.com');
  });

  await suite.test('4. Invalid, expired, and tampered tokens are rejected', async (t) => {
    const userCopy = { ...dummyUser, activeSessionId: 'active-session-123' };
    t.mock.method(User, 'findById', () => ({
      select: async () => userCopy,
      ...userCopy,
    }));

    // Random string
    const res1 = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: 'Bearer not_a_real_token' },
    });
    assert.equal(res1.status, 401);

    // Expired token (expiresIn -1)
    const expiredToken = tokens.sign(userCopy, 'access', -1, { sid: 'active-session-123' });
    const res2 = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(res2.status, 401);

    // Tampered token
    const validToken = tokens.sign(userCopy, 'access', '15m', { sid: 'active-session-123' });
    const tampered = validToken.slice(0, -5) + 'xxxxx';
    const res3 = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    assert.equal(res3.status, 401);

    // Refresh token used on access endpoint
    const refreshToken = tokens.sign(userCopy, 'refresh', '7d', { sid: 'active-session-123' });
    const res4 = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    assert.equal(res4.status, 401);
  });

  await suite.test('5. requireTeam allow and deny cases - records exact matching rule', async (t) => {
    const userInTeam = {
      ...dummyUser,
      team: 'Engineering',
      activeSessionId: 'sess-team',
    };
    t.mock.method(User, 'findById', () => ({
      select: async () => userInTeam,
      ...userInTeam,
    }));
    t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));

    // Allow: user is member of team Engineering (case-insensitive exact match)
    t.mock.method(Team, 'findOne', async (query) => {
      if (query?.name && query.name.test && query.name.test('Engineering')) {
        return { _id: 'team123', name: 'Engineering', members: [userInTeam._id] };
      }
      return null;
    });

    const token = tokens.sign(userInTeam, 'access', '15m', { sid: 'sess-team' });
    const resAllow = await fetch(`${baseUrl}/test/team-protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resAllow.status, 200);

    // Deny: user in different team
    const userOtherTeam = { ...dummyUser, team: 'Marketing', activeSessionId: 'sess-team-2' };
    t.mock.method(User, 'findById', () => ({
      select: async () => userOtherTeam,
      ...userOtherTeam,
    }));
    t.mock.method(Team, 'findOne', async () => null);

    const tokenDeny = tokens.sign(userOtherTeam, 'access', '15m', { sid: 'sess-team-2' });
    const resDeny = await fetch(`${baseUrl}/test/team-protected`, {
      headers: { Authorization: `Bearer ${tokenDeny}` },
    });
    assert.equal(resDeny.status, 403);
    const denyBody = await resDeny.json();
    assert.match(denyBody.message, /Engineering team membership required/);
  });

  await suite.test('6. Error handler output for normal 4xx error', async () => {
    // 404 Route Not Found
    const res404 = await fetch(`${baseUrl}/non-existent-route`);
    assert.equal(res404.status, 404);
    const body404 = await res404.json();
    assert.equal(body404.success, false);
    assert.equal(body404.message, 'Route not found');

    // 400 Bad Request on empty login
    const res400 = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res400.status, 400);
    const body400 = await res400.json();
    assert.equal(body400.success, false);
    assert.equal(body400.message, 'Email and password are required');
  });
});
