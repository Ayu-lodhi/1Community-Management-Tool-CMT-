const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generateSync } = require('otplib');

process.env.JWT_SECRET = 'synthetic-password-change-test-secret-only';
process.env.MFA_ENCRYPTION_KEY = 'cd'.repeat(32);
const User = require('../../admin/admin.model');
const repository = require('../auth.repository');
const tokens = require('../auth.tokens');
const mfa = require('../mfa.service');
const { authenticateToken } = require('../auth.middleware');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

test('mandatory replacement rejects even access-purpose tokens with current password proof', async (t) => {
  const user = { _id: '111111111111111111111111', password: 'synthetic-hash',
    role: ROLES.T1_VOLUNTEER, isActive: true, mustChangePassword: true };
  t.mock.method(repository, 'findById', async () => user);
  await assert.rejects(authenticateToken(tokens.sign(user, 'access', '5m')), /replacement/);
  await assert.rejects(authenticateToken(tokens.sign(user, 'password-change', '5m')), /purpose/);
});

const databaseUri = process.env.MFA_TEST_MONGODB_URI;
test('mandatory password replacement with MongoDB and mounted HTTP routes', { skip: !databaseUri }, async (t) => {
  await mongoose.connect(databaseUri, { dbName: `password_test_${randomUUID().replaceAll('-', '')}`,
    serverSelectionTimeoutMS: 5000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await User.init();
  const email = require('../../../services/email.service');
  t.mock.method(email, 'sendPasswordResetEmail', async () => ({ success: false }));
  t.mock.method(email, 'sendWelcomeEmail', async () => ({ success: true }));
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../auth.routes'));
  app.use('/events', require('../../events/events.routes'));
  app.use('/admin', require('../../admin/admin.routes'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const temporary = 'Temporary-test-password1!';
  const permanent = 'Permanent-test-password2!';
  const hash = await bcrypt.hash(temporary, 4);
  const fixture = (extra = {}) => User.create({ name: 'Synthetic fixture', email: `${randomUUID()}@example.test`,
    password: hash, role: ROLES.T1_VOLUNTEER, ...extra });
  async function request(path, token, body) {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  const login = (user, password = temporary) => request('/auth/login', null, { email: user.email, password });
  const replace = (token, newPassword = permanent, oldPassword) =>
    request('/auth/change-password', token, { newPassword, oldPassword });

  await t.test('temporary login is consumed once and only permits replacement; completion requires a fresh login', async () => {
    const user = await fixture();
    // Legacy documents without the new field must also be consumed exactly once.
    await User.updateOne({ _id: user._id }, { $unset: { passwordChangeStartedAt: '' } });
    assert.equal((await login(user, 'incorrect')).status, 401);
    const first = await login(user);
    assert.equal(first.status, 200);
    assert.deepEqual(Object.keys(first.body.data).sort(), ['mustChangePassword', 'passwordChangeToken']);
    const token = first.body.data.passwordChangeToken;
    const claims = tokens.verify(token, 'password-change');
    assert.ok(claims.exp - claims.iat > 0 && claims.exp - claims.iat <= 300);
    assert.equal((await login(user)).status, 401);
    for (const path of ['/auth/me', '/events', '/admin/users']) {
      assert.equal((await request(path, token)).status, 401);
    }
    assert.equal((await request('/events', token, { title: 'unauthorized' })).status, 401);
    assert.equal((await replace(undefined)).status, 401);
    for (const password of [temporary, 'short', 'lowercaseonly1!', { $ne: null }]) {
      assert.equal((await replace(token, password)).status, 400);
    }
    assert.equal((await replace(token)).status, 200);
    const stored = await repository.findById(user._id);
    assert.equal(stored.mustChangePassword, false);
    assert.equal(stored.passwordChangeStartedAt, null);
    assert.equal(await bcrypt.compare(permanent, stored.password), true);
    assert.equal((await replace(token)).status, 401);
    assert.equal((await login(user)).status, 401);
    const normal = await login(user, permanent);
    assert.equal(normal.status, 200);
    assert.equal((await request('/auth/me', normal.body.data.accessToken)).status, 200);
    assert.equal((await replace(normal.body.data.refreshToken)).status, 401);
    assert.equal((await replace(normal.body.data.accessToken, 'Another-test-password3!', 'wrong')).status, 400);
    assert.equal((await replace(normal.body.data.accessToken, 'Another-test-password3!', permanent)).status, 200);
    assert.equal((await request('/auth/me', normal.body.data.accessToken)).status, 401);
  });

  await t.test('simultaneous logins and replacement requests each have one winner', async () => {
    const user = await fixture();
    const attempts = await Promise.all([login(user), login(user)]);
    assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 401]);
    const token = attempts.find((r) => r.status === 200).body.data.passwordChangeToken;
    const outcomes = await Promise.all([replace(token), replace(token, 'Other-password3!')]);
    assert.equal(outcomes.filter((r) => r.status === 200).length, 1);
    assert.ok(outcomes.some((r) => [400, 401].includes(r.status)));
  });

  await t.test('expired, tampered, wrong-purpose and stale credentials cannot replace a password', async () => {
    const user = await fixture();
    const token = (await login(user)).body.data.passwordChangeToken;
    const stored = await repository.findById(user._id);
    for (const invalid of [tokens.sign(stored, 'password-change', -1), tokens.sign(stored, 'access', '5m'),
      tokens.sign(stored, 'mfa', '5m'), tokens.sign(stored, 'refresh', '5m'), token + 'tampered']) {
      assert.equal((await replace(invalid)).status, 401);
    }
    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });
    assert.equal((await replace(token)).status, 401);
    await User.updateOne({ _id: user._id }, { $set: { isActive: true, password: await bcrypt.hash('Reset-password3!', 4),
      passwordChangeStartedAt: null } });
    assert.equal((await replace(token)).status, 401);
    assert.equal((await repository.replacePassword(stored, hash)), null);
    const reset = await login(user, 'Reset-password3!');
    assert.equal(reset.status, 200);
    await User.deleteOne({ _id: user._id });
    assert.equal((await replace(reset.body.data.passwordChangeToken)).status, 401);
  });

  for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
    await t.test(`${role} requires MFA before replacement and again for the new session`, async () => {
      const enrollment = mfa.createEnrollment('synthetic@example.test');
      const secret = new URL(enrollment.otpauthUrl).searchParams.get('secret');
      const user = await fixture({ role, mfa: enrollment.mfa });
      const first = await login(user);
      assert.equal(first.body.data.mfaRequired, true);
      assert.equal((await login(user)).status, 401);
      const challengeToken = first.body.data.challengeToken;
      assert.equal((await replace(challengeToken)).status, 401);
      const stored = await repository.findById(user._id);
      assert.equal((await replace(tokens.sign(stored, 'password-change', '5m'))).status, 401);
      const verified = await request('/auth/mfa/verify', null, { challengeToken, code: generateSync({ secret }) });
      assert.equal(verified.status, 200, verified.body.message);
      assert.equal(verified.body.data.accessToken, undefined);
      const token = verified.body.data.passwordChangeToken;
      assert.equal((await request('/admin/users', token)).status, 401);
      assert.equal((await replace(token)).status, 200);
      const next = await login(user, permanent);
      assert.equal(next.body.data.mfaRequired, true);
      assert.equal(next.body.data.accessToken, undefined);
    });
  }

  await t.test('MFA verification cannot extend the five-minute replacement deadline', async () => {
    const enrollment = mfa.createEnrollment('synthetic@example.test');
    const secret = new URL(enrollment.otpauthUrl).searchParams.get('secret');
    const user = await fixture({ role: ROLES.ADMIN, mfa: enrollment.mfa });
    await login(user);
    await User.updateOne({ _id: user._id }, { $set: { passwordChangeStartedAt: new Date(Date.now() - 301000) } });
    const stored = await repository.findById(user._id);
    const response = await request('/auth/mfa/verify', null, {
      challengeToken: tokens.sign(stored, 'mfa', '5m'), code: generateSync({ secret }),
    });
    assert.equal(response.status, 401);
    assert.match(response.body.message, /expired/);
    assert.equal((await login(user)).status, 401);
  });

  await t.test('administrator reset and reactivation rearm temporary login and invalidate pending replacement', async () => {
    const admin = require('../../admin/admin.service');
    const user = await fixture();
    const oldToken = (await login(user)).body.data.passwordChangeToken;
    const reset = await admin.resetPassword(user._id);
    assert.equal((await replace(oldToken)).status, 401);
    assert.equal((await login(user, reset.tempPassword)).status, 200);
    await admin.revokeUser(user._id, 'Synthetic test', '', new mongoose.Types.ObjectId());
    const reactivated = await admin.reactivateUser(user._id);
    assert.equal((await login(user, reactivated.tempPassword)).status, 200);
  });
});
