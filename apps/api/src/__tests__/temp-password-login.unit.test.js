const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long_temp_login';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long_temp_login';

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

test('Temporary Password Onboarding & First-Login Flow Suite', async (t) => {
  const userId = new mongoose.Types.ObjectId().toString();
  const rawTempPassword = 'TBI@TempPass123';
  const tempPasswordHash = await bcrypt.hash(rawTempPassword, 6);

  let userInDb = {
    _id: userId,
    userId: 'TBI00123',
    name: 'New Volunteer',
    email: 'newvolunteer@example.com',
    role: 'T1_VOLUNTEER',
    password: tempPasswordHash,
    isActive: true,
    mustChangePassword: true,
    tempPasswordExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days ahead
    passwordChangeStartedAt: null,
    activeSessionId: null,
    lastActivity: null,
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  };

  const origFindByIdentifier = repository.findByIdentifier;
  const origFindById = repository.findById;
  const origConsume = repository.consumeTemporaryPassword;
  const origUserFindByIdAndUpdate = User.findByIdAndUpdate;

  t.beforeEach(() => {
    userInDb = {
      _id: userId,
      userId: 'TBI00123',
      name: 'New Volunteer',
      email: 'newvolunteer@example.com',
      role: 'T1_VOLUNTEER',
      password: tempPasswordHash,
      isActive: true,
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      passwordChangeStartedAt: null,
      activeSessionId: null,
      lastActivity: null,
      save: async function () { return this; },
      toObject: function () { return { ...this }; },
    };

    repository.findByIdentifier = async (ident) => {
      const norm = String(ident).trim();
      if (norm.toUpperCase() === userInDb.userId || norm.toLowerCase() === userInDb.email.toLowerCase()) {
        return { ...userInDb };
      }
      return null;
    };

    repository.findById = async (id) => (String(id) === String(userId) ? { ...userInDb } : null);

    repository.consumeTemporaryPassword = async (user) => {
      userInDb.passwordChangeStartedAt = new Date();
      return { ...userInDb };
    };

    User.findByIdAndUpdate = (id, update) => {
      if (update.$set) Object.assign(userInDb, update.$set);
      const doc = { ...userInDb };
      return {
        select: (fields) => {
          // Verify that passwordChangeStartedAt is preserved when selected
          return doc;
        },
        then: (resolve) => resolve(doc),
      };
    };
  });

  t.afterEach(() => {
    repository.findByIdentifier = origFindByIdentifier;
    repository.findById = origFindById;
    repository.consumeTemporaryPassword = origConsume;
    User.findByIdAndUpdate = origUserFindByIdAndUpdate;
  });

  await t.test('1. First login with User ID and temporary password succeeds and returns passwordChangeToken', async () => {
    const res = await authService.login('TBI00123', rawTempPassword);
    assert.strictEqual(res.mustChangePassword, true);
    assert.ok(res.passwordChangeToken, 'Must return passwordChangeToken');
    assert.ok(userInDb.passwordChangeStartedAt instanceof Date);
  });

  await t.test('2. First login with lowercase User ID and whitespace is normalized and succeeds', async () => {
    const res = await authService.login('  tbi00123  ', rawTempPassword);
    assert.strictEqual(res.mustChangePassword, true);
    assert.ok(res.passwordChangeToken);
  });

  await t.test('3. First login with Email and temporary password succeeds', async () => {
    const res = await authService.login('newvolunteer@example.com', rawTempPassword);
    assert.strictEqual(res.mustChangePassword, true);
    assert.ok(res.passwordChangeToken);
  });

  await t.test('4. User who closed previous tab can re-login with temporary password within 7 days', async () => {
    // Simulate first login attempt 10 minutes ago that wasn't completed
    userInDb.passwordChangeStartedAt = new Date(Date.now() - 10 * 60 * 1000);

    const res = await authService.login('TBI00123', rawTempPassword);
    assert.strictEqual(res.mustChangePassword, true);
    assert.ok(res.passwordChangeToken, 'Must grant new token window');
  });

  await t.test('5. Expired temporary password (> 7 days) is rejected', async () => {
    userInDb.tempPasswordExpiresAt = new Date(Date.now() - 1000); // Expired in the past

    await assert.rejects(
      () => authService.login('TBI00123', rawTempPassword),
      /temporary password expired/i
    );
  });

  await t.test('6. Temporary password-change token is rejected by regular API protection middleware', async () => {
    const res = await authService.login('TBI00123', rawTempPassword);
    const token = res.passwordChangeToken;
    const { authenticateToken } = require('../modules/auth/auth.middleware');

    // authenticateToken with allowPasswordChange = false (standard API protection)
    await assert.rejects(
      () => authenticateToken(token, false),
      /jwt purpose invalid|invalid token|replacement/i
    );
  });

  await t.test('7. After user sets new permanent password, old temporary password is dead', async () => {
    const newPermanentHash = await bcrypt.hash('PermanentNewPass123!', 6);
    userInDb.password = newPermanentHash;
    userInDb.mustChangePassword = false;
    userInDb.passwordChangeStartedAt = null;
    userInDb.tempPasswordExpiresAt = null;

    // Logging in with rawTempPassword now fails with Invalid credentials
    await assert.rejects(
      () => authService.login('TBI00123', rawTempPassword),
      /invalid credentials/i
    );
  });
});
