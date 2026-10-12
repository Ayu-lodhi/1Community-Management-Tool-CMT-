const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateSync, verifySync } = require('otplib');

process.env.JWT_SECRET = 'synthetic-mfa-test-signing-secret-only';
process.env.MFA_ENCRYPTION_KEY = 'ab'.repeat(32);
const User = require('../../admin/admin.model');
const repository = require('../auth.repository');
const tokens = require('../auth.tokens');
const mfaService = require('../mfa.service');
const { authenticateToken } = require('../auth.middleware');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

// RFC 6238 SHA-1 test vector (six-digit truncation of 94287082 at epoch 59).
test('installed TOTP verifier matches the RFC vector and enforces time/replay bounds', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const result = verifySync({ secret, token: '287082', epoch: 59 });
  assert.equal(result.valid, true);
  assert.equal(result.timeStep, 1);
  assert.equal(verifySync({ secret, token: '287082', epoch: 59, afterTimeStep: 1 }).valid, false);
  assert.equal(verifySync({ secret, token: '287082', epoch: 120, epochTolerance: 30 }).valid, false);
});

test('privileged authentication policy and token-purpose separation', async (t) => {
  const user = { _id: '111111111111111111111111', password: 'fixture-hash', isActive: true, role: ROLES.ADMIN };
  t.mock.method(repository, 'findById', async () => user);
  for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
    user.role = role;
    await assert.rejects(authenticateToken(tokens.sign(user, 'access', '5m')), /MFA/);
    await assert.rejects(authenticateToken(tokens.sign(user, 'access', '5m', { isMfaVerified: 'true' })), /MFA/);
  }
  for (const purpose of ['mfa', 'refresh']) {
    await assert.rejects(authenticateToken(tokens.sign(user, purpose, '5m', { isMfaVerified: true })), /purpose/);
  }
  await assert.rejects(authenticateToken(jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET)), /purpose/);
});

const databaseUri = process.env.MFA_TEST_MONGODB_URI;
test('MFA login and mounted-route regression tests with MongoDB', { skip: !databaseUri }, async (t) => {
  const dbName = `mfa_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(databaseUri, { dbName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await User.init();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', require('../auth.routes'));
  app.use('/api/v1/admin', require('../../admin/admin.routes'));
  app.use('/api/v1/super-admin', require('../../super-admin/superAdmin.routes'));
  app.use('/api/v1/events', require('../../events/events.routes'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const password = 'Synthetic-password!1';
  const hash = await bcrypt.hash(password, 4);

  async function fixture(role = ROLES.ADMIN, enrolled = true) {
    const email = `${randomUUID()}@example.test`;
    const enrollment = mfaService.createEnrollment(email);
    const secret = new URL(enrollment.otpauthUrl).searchParams.get('secret');
    const user = await User.create({ name: 'Synthetic fixture', email, password: hash, role, mustChangePassword: false,
      ...(enrolled ? { mfa: enrollment.mfa } : {}) });
    return { user, secret, enrollment, code: () => generateSync({ secret }) };
  }
  async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  const login = (user, extra = {}) => request('/auth/login', { body: { email: user.email, password, ...extra } });
  const verify = (challengeToken, code, extra = {}) => request('/auth/mfa/verify', { body: { challengeToken, code, ...extra } });

  for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
    await t.test(`${role}: password alone cannot read or mutate privileged routes; verified TOTP can`, async () => {
      const f = await fixture(role);
      const first = await login(f.user, { isMfaVerified: true });
      assert.equal(first.status, 200);
      assert.equal(first.cache, 'no-store');
      assert.equal(first.body.data.mfaRequired, true);
      assert.deepEqual(Object.keys(first.body.data).sort(), ['challengeToken', 'mfaRequired']);
      const challenge = first.body.data.challengeToken;
      const claims = tokens.verify(challenge, 'mfa');
      assert.equal(claims.exp - claims.iat, 300);
      assert.equal(claims.role, undefined);
      const oldToken = jwt.sign({ sub: String(f.user._id), role }, process.env.JWT_SECRET);
      for (const token of [challenge, oldToken, tokens.sign(f.user, 'refresh', '5m'),
        tokens.sign(f.user, 'access', '5m', { role, isMfaVerified: false })]) {
        for (const path of ['/admin/users', '/super-admin/audit-logs', '/events']) {
          assert.equal((await request(path, { token })).status, 401);
        }
        assert.equal((await request('/admin/users', { token, body: { role: ROLES.SUPER_ADMIN } })).status, 401);
      }
      for (const code of [undefined, '', 'abc123', 123456, {}, generateSync({ secret: f.secret, epoch: 59 })]) {
        assert.equal((await verify(challenge, code, { isMfaVerified: true })).status, 401);
      }
      const second = await verify(challenge, f.code());
      assert.equal(second.status, 200, second.body.message);
      const { accessToken, refreshToken, user } = second.body.data;
      assert.equal(user.mfa, undefined);
      assert.equal(user.password, undefined);
      assert.equal(tokens.verify(accessToken, 'access').isMfaVerified, true);
      assert.equal((await request('/admin/users', { token: accessToken })).status, 200);
      assert.equal((await request('/super-admin/audit-logs', { token: accessToken })).status, role === ROLES.SUPER_ADMIN ? 200 : 403);
      assert.equal((await request('/admin/users', { token: refreshToken })).status, 401);
      assert.equal((await verify(refreshToken, f.code())).status, 401);
      assert.equal((await verify(accessToken, f.code())).status, 401);
      assert.equal((await verify(challenge, f.code())).status, 401);
      const me = await request('/auth/me', { token: accessToken });
      assert.equal(me.body.data.mfa, undefined);
      const profile = await request(`/admin/users/${f.user._id}`, {
        method: 'PATCH', token: accessToken, body: { name: 'Updated', mfa: { version: 'attacker' }, 'mfa.secret': 'attacker' },
      });
      assert.equal(profile.status, 200);
      assert.equal(profile.body.data.mfa, undefined);
      assert.equal((await repository.findById(f.user._id)).mfa.version, f.enrollment.mfa.version);
    });
  }

  await t.test('unenrolled privileged accounts fail closed and trusted enrollment requires a code', async () => {
    const f = await fixture(ROLES.ADMIN, false);
    assert.equal((await login(f.user)).status, 401);
    assert.equal((await User.findById(f.user._id)).mfa, undefined);
    await assert.rejects(mfaService.enroll(f.user.email, f.enrollment,
      generateSync({ secret: f.secret, epoch: 59 })), /Invalid/);
    assert.equal((await repository.findById(f.user._id)).mfa, undefined);
    await mfaService.enroll(f.user.email, f.enrollment, f.code());
    await assert.rejects(mfaService.enroll(f.user.email, f.enrollment, f.code()), /eligible/);
    const stored = await repository.findById(f.user._id);
    assert.notEqual(stored.mfa.secret, f.secret);
    assert.equal((await login(f.user)).body.data.mfaRequired, true);
    assert.equal((await User.findById(f.user._id)).mfa, undefined);
  });

  await t.test('five attempts across challenges and concurrent requests, then window reset', async () => {
    const f = await fixture();
    const first = (await login(f.user)).body.data.challengeToken;
    const wrong = generateSync({ secret: f.secret, epoch: 59 });
    const responses = await Promise.all(Array.from({ length: 8 }, () => verify(first, wrong)));
    assert.ok(responses.every((r) => r.status === 401));
    assert.equal((await repository.findById(f.user._id)).mfa.attempts, 5);
    const next = (await login(f.user)).body.data.challengeToken;
    assert.equal((await verify(next, f.code())).status, 401);
    await User.updateOne({ _id: f.user._id }, { $set: { 'mfa.windowStartedAt': new Date(Date.now() - 301000) } });
    assert.equal((await verify(next, f.code())).status, 200);
  });

  await t.test('simultaneous verification cannot consume a TOTP twice', async () => {
    const f = await fixture();
    const first = (await login(f.user)).body.data.challengeToken;
    const code = f.code();
    const outcomes = await Promise.all([verify(first, code), verify(first, code)]);
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 401]);
  });

  await t.test('rejects expired/tampered challenges and account or credential changes', async () => {
    const f = await fixture();
    const first = (await login(f.user)).body.data.challengeToken;
    assert.equal((await verify(tokens.sign(f.user, 'mfa', -1), f.code())).status, 401);
    assert.equal((await verify(first.slice(0, -4) + 'xxxx', f.code())).status, 401);
    assert.equal((await login(f.user, { password: 'incorrect' })).status, 401);
    await User.updateOne({ _id: f.user._id }, { $set: { password: 'changed-password-hash' } });
    assert.equal((await verify(first, f.code())).status, 401);
    await User.updateOne({ _id: f.user._id }, { $set: { password: hash, isActive: false } });
    assert.equal((await verify(first, f.code())).status, 401);
    await User.updateOne({ _id: f.user._id }, { $set: { isActive: true, 'mfa.version': randomUUID() } });
    assert.equal((await verify(first, f.code())).status, 401);
    await User.deleteOne({ _id: f.user._id });
    assert.equal((await verify(first, f.code())).status, 401);
  });

  await t.test('nonprivileged login works; promoting an existing session requires MFA', async () => {
    const f = await fixture(ROLES.T1_VOLUNTEER, false);
    const first = await login(f.user);
    assert.equal(first.status, 200);
    const token = first.body.data.accessToken;
    assert.equal((await request('/auth/me', { token })).status, 200);
    assert.equal((await request('/admin/users', { token })).status, 403);
    await User.updateOne({ _id: f.user._id }, { $set: { role: ROLES.ADMIN } });
    assert.equal((await request('/admin/users', { token })).status, 401);
    assert.equal((await login(f.user)).status, 401);
  });

  await t.test('completed MFA is invalidated by password/factor changes or deactivation', async () => {
    const f = await fixture();
    const first = (await login(f.user)).body.data.challengeToken;
    const verified = await verify(first, f.code());
    const token = verified.body.data.accessToken;
    await User.updateOne({ _id: f.user._id }, { $set: { isActive: false } });
    assert.equal((await request('/admin/users', { token })).status, 401);
    await User.updateOne({ _id: f.user._id }, { $set: { isActive: true, password: 'changed' } });
    assert.equal((await request('/admin/users', { token })).status, 401);
    await User.updateOne({ _id: f.user._id }, { $set: { password: hash, 'mfa.version': randomUUID() } });
    assert.equal((await request('/admin/users', { token })).status, 401);
  });
});
