const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const adminService = require('../modules/admin/admin.service');
const adminRoutes = require('../modules/admin/admin.routes');
const User = require('../modules/admin/admin.model');

test('Password Reset Revocation and Route Rate Limiting', async (t) => {
  const origFindById = User.findById;
  const origFindOneAndUpdate = User.findOneAndUpdate;

  t.afterEach(() => {
    User.findById = origFindById;
    User.findOneAndUpdate = origFindOneAndUpdate;
  });

  await t.test('completePasswordReset clears activeSessionId and lastActivity upon completion', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    let saved = false;
    const mockUser = {
      _id: userId,
      email: 'user@example.com',
      name: 'Test User',
      passwordResetToken: tokenHash,
      passwordResetExpiry: new Date(Date.now() + 3600000),
      activeSessionId: 'active-session-12345',
      lastActivity: new Date(),
      save: async function () {
        saved = true;
      },
      toObject: function () {
        return { _id: this._id, email: this.email, activeSessionId: this.activeSessionId };
      },
    };

    User.findById = () => ({
      select: async () => mockUser,
    });

    await adminService.completePasswordReset(userId, rawToken, 'NewPassword123!');

    assert.strictEqual(saved, true);
    assert.strictEqual(mockUser.passwordResetToken, null, 'Reset token must be cleared');
    assert.strictEqual(mockUser.activeSessionId, null, 'activeSessionId must be cleared on password reset');
    assert.strictEqual(mockUser.lastActivity, null, 'lastActivity must be cleared on password reset');
  });

  await t.test('reset-password routes have rate limiting middleware attached', () => {
    const verifyRoute = adminRoutes.stack.find(
      (layer) => layer.route && layer.route.path === '/reset-password/verify' && layer.route.methods.get
    );
    assert.ok(verifyRoute, 'GET /reset-password/verify route should exist');
    assert.ok(
      verifyRoute.route.stack.length >= 2,
      'GET /reset-password/verify must have rate limiting middleware'
    );

    const completeRoute = adminRoutes.stack.find(
      (layer) => layer.route && layer.route.path === '/reset-password/complete' && layer.route.methods.post
    );
    assert.ok(completeRoute, 'POST /reset-password/complete route should exist');
    assert.ok(
      completeRoute.route.stack.length >= 2,
      'POST /reset-password/complete must have rate limiting middleware'
    );
  });

  await t.test('verifyResetToken rejects malformed ObjectId safely with clean error', async () => {
    await assert.rejects(
      () => adminService.verifyResetToken('not-a-valid-id', 'some-raw-token'),
      (err) => {
        assert.strictEqual(err.message, 'Invalid or expired reset link');
        return true;
      }
    );
  });

  await t.test('completePasswordReset rejects malformed ObjectId safely with clean error', async () => {
    await assert.rejects(
      () => adminService.completePasswordReset('invalid-id-format', 'some-raw-token', 'NewPass123!'),
      (err) => {
        assert.strictEqual(err.message, 'Invalid or expired reset link');
        return true;
      }
    );
  });

  await t.test('completePasswordReset supports atomic findOneAndUpdate consumption', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    let atomicQuery = null;
    let atomicUpdate = null;
    const origFindOneAndUpdate = User.findOneAndUpdate;

    User.findOneAndUpdate = async (query, update) => {
      atomicQuery = query;
      atomicUpdate = update;
      return {
        _id: userId,
        email: 'atomic@example.com',
        name: 'Atomic User',
        toObject: () => ({ _id: userId, email: 'atomic@example.com' }),
      };
    };

    try {
      const res = await adminService.completePasswordReset(userId, rawToken, 'AtomicPass123!');
      assert.ok(res.user);
      assert.strictEqual(atomicQuery._id, userId);
      assert.strictEqual(atomicQuery.passwordResetToken, tokenHash);
      assert.strictEqual(atomicUpdate.$set.passwordResetToken, null);
      assert.strictEqual(atomicUpdate.$set.activeSessionId, null);
    } finally {
      User.findOneAndUpdate = origFindOneAndUpdate;
    }
  });
});
