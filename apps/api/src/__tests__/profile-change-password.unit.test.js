const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long_profile_pwd';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long_profile_pwd';

// Intercept nodemailer to eliminate network wait
nodemailer.createTransport = () => ({
  sendMail: async () => ({ messageId: 'mock-mail-id' }),
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

// Mock mongoose db and readyState
mongoose.connection.db = {
  collection: () => ({
    createIndex: async () => {},
    dropIndex: async () => {},
  }),
};
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

const User = require('../modules/admin/admin.model');
const authService = require('../modules/auth/auth.service');
const repository = require('../modules/auth/auth.repository');
const tokens = require('../modules/auth/auth.tokens');
const { authenticateToken } = require('../modules/auth/auth.middleware');
const AuditLog = require('../models/AuditLog.model');
const { checkPasswordRateLimit, recordFailedPasswordChange, resetPasswordRateLimit } = require('../middleware/rateLimit.middleware');

test('Profile Change Password Comprehensive Suite', async (t) => {
  const userId = new mongoose.Types.ObjectId().toString();
  const oldPassword = 'OldPassword123!';
  const newPassword = 'NewPassword123!';
  const oldPasswordHash = await bcrypt.hash(oldPassword, 6);

  let currentUserDoc = {
    _id: userId,
    userId: 'TBI00099',
    name: 'Profile Tester',
    email: 'profile.tester@example.com',
    role: 'T1_VOLUNTEER',
    password: oldPasswordHash,
    isActive: true,
    mustChangePassword: false,
    activeSessionId: 'sess-active-1',
    lastActivity: new Date(),
    passwordChangeStartedAt: null,
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  };

  const origFindById = repository.findById;
  const origUserFindById = User.findById;
  const origReplacePassword = repository.replacePassword;
  const origAuditCreate = AuditLog.create;

  t.beforeEach(() => {
    currentUserDoc.password = oldPasswordHash;
    currentUserDoc.mustChangePassword = false;
    currentUserDoc.activeSessionId = 'sess-active-1';
    currentUserDoc.lastActivity = new Date();
    currentUserDoc.passwordChangeStartedAt = null;
    resetPasswordRateLimit(userId, '127.0.0.1');

    repository.findById = async (id) => (String(id) === String(userId) ? currentUserDoc : null);
    User.findById = async (id) => (String(id) === String(userId) ? currentUserDoc : null);
    repository.replacePassword = async (user, newHash) => {
      user.password = newHash;
      user.activeSessionId = null;
      user.lastActivity = null;
      user.mustChangePassword = false;
      return user;
    };
  });

  t.afterEach(() => {
    repository.findById = origFindById;
    User.findById = origUserFindById;
    repository.replacePassword = origReplacePassword;
    AuditLog.create = origAuditCreate;
  });

  await t.test('1. wrong current password rejected and the stored hash unchanged', async () => {
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };
    await assert.rejects(
      () => authService.changePassword(cred, 'WrongOldPass1!', newPassword, { ip: '127.0.0.1' }),
      /current password/i
    );
    assert.strictEqual(currentUserDoc.password, oldPasswordHash, 'Stored password hash must remain unchanged');
  });

  await t.test('2. correct change succeeds and the new password logs in while the old does not', async () => {
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };
    const res = await authService.changePassword(cred, oldPassword, newPassword, { ip: '127.0.0.1' });
    assert.strictEqual(res.success, true);

    // New password verifies against updated hash
    const newMatches = await bcrypt.compare(newPassword, currentUserDoc.password);
    assert.strictEqual(newMatches, true, 'New password must match stored hash');

    // Old password no longer matches
    const oldMatches = await bcrypt.compare(oldPassword, currentUserDoc.password);
    assert.strictEqual(oldMatches, false, 'Old password must no longer match');
  });

  await t.test('3. same password rejected', async () => {
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };
    await assert.rejects(
      () => authService.changePassword(cred, oldPassword, oldPassword, { ip: '127.0.0.1' }),
      /must differ/i
    );
  });

  await t.test('4. too short and over 72 bytes rejected', async () => {
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };

    // Too short (< 8 chars)
    await assert.rejects(
      () => authService.changePassword(cred, oldPassword, 'Short1!', { ip: '127.0.0.1' }),
      /at least 8 characters/i
    );

    // Over 72 UTF-8 bytes
    const overlong = 'A1!' + 'a'.repeat(71);
    assert.ok(Buffer.byteLength(overlong, 'utf8') > 72);
    await assert.rejects(
      () => authService.changePassword(cred, oldPassword, overlong, { ip: '127.0.0.1' }),
      /exceed 72/i
    );
  });

  await t.test('5. unauthenticated denied', async () => {
    await assert.rejects(
      () => authenticateToken(''),
      /not authenticated|invalid token|jwt must be provided/i
    );
  });

  await t.test('6. a token with the wrong purpose denied', async () => {
    // Normal user (mustChangePassword = false) attempting to use a password-change token
    const wrongPurposeToken = tokens.sign(currentUserDoc, 'password-change', '15m');
    await assert.rejects(
      () => authenticateToken(wrongPurposeToken, true),
      /Password replacement required|purpose/i
    );
  });

  await t.test('7. old access token rejected after the change', async () => {
    // Generate valid access token before change
    const oldAccessToken = tokens.sign(currentUserDoc, 'access', '15m');

    // Perform password change
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };
    await authService.changePassword(cred, oldPassword, newPassword, { ip: '127.0.0.1' });

    // The old access token must now be rejected because authState changed and activeSessionId was cleared
    await assert.rejects(
      () => authenticateToken(oldAccessToken, true),
      /credentials changed|sign in again|session ended/i
    );
  });

  await t.test('8. rate limit returns 429 after 5 failed attempts', async () => {
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };
    resetPasswordRateLimit(userId, '127.0.0.1');

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => authService.changePassword(cred, 'WrongPass1!', newPassword, { ip: '127.0.0.1' }),
        /current password/i
      );
    }

    // 6th attempt must be rejected by rate limiter with 429
    await assert.rejects(
      () => authService.changePassword(cred, 'WrongPass1!', newPassword, { ip: '127.0.0.1' }),
      (err) => {
        assert.ok(err.statusCode === 429 || /too many/i.test(err.message));
        return true;
      }
    );
  });

  await t.test('9. audit entry written on success and contains no password', async () => {
    let capturedAudit = null;
    AuditLog.create = async (entry) => {
      capturedAudit = entry;
      return entry;
    };

    const cred = { sub: userId, name: 'Profile Tester', email: 'profile.tester@example.com', purpose: 'access', authState: tokens.authState(currentUserDoc) };
    await authService.changePassword(cred, oldPassword, newPassword, { ip: '127.0.0.1' });

    assert.ok(capturedAudit, 'Audit log entry must be created');
    assert.strictEqual(capturedAudit.action, 'PASSWORD_CHANGED');
    assert.strictEqual(String(capturedAudit.performedBy), userId);

    const serialized = JSON.stringify(capturedAudit);
    assert.strictEqual(serialized.includes(oldPassword), false, 'Audit log must not contain old password');
    assert.strictEqual(serialized.includes(newPassword), false, 'Audit log must not contain new password');
  });

  await t.test('10. response contains no password or hash', async () => {
    const cred = { sub: userId, purpose: 'access', authState: tokens.authState(currentUserDoc) };
    const res = await authService.changePassword(cred, oldPassword, newPassword, { ip: '127.0.0.1' });

    assert.strictEqual(res.password, undefined);
    assert.strictEqual(res.hash, undefined);
    assert.strictEqual(res.token, undefined);
    assert.strictEqual(res.success, true);
  });

  await t.test('11. the forced first-login change (mustChangePassword) still works', async () => {
    currentUserDoc.mustChangePassword = true;
    currentUserDoc.passwordChangeStartedAt = new Date();

    const cred = { sub: userId, purpose: 'password-change', authState: tokens.authState(currentUserDoc) };
    // In forced change, oldPassword is not required
    const res = await authService.changePassword(cred, undefined, newPassword, { ip: '127.0.0.1' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(currentUserDoc.mustChangePassword, false);
  });

  await t.test('12. a user cannot change another user password by sending a user id in the body', async () => {
    const attackerId = new mongoose.Types.ObjectId().toString();
    const victimId = userId;
    const attackerCred = { sub: attackerId, purpose: 'access', authState: 'attacker-auth-state' };

    let lookupId = null;
    repository.findById = async (id) => {
      lookupId = id;
      return null; // Attacker not found
    };

    // Body contains victimId, but service must look up attackerCred.sub
    await assert.rejects(
      () => authService.changePassword(attackerCred, oldPassword, newPassword, { ip: '127.0.0.1', targetUserId: victimId }),
      /credentials changed|sign in again|invalid/i
    );
    assert.strictEqual(lookupId, attackerId, 'Must look up authenticated credential.sub, never targetUserId');
  });
});
