const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long_e2e';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long_e2e';

// Intercept nodemailer to capture email payload
let lastSentEmail = null;
nodemailer.createTransport = () => ({
  sendMail: async (opts) => {
    lastSentEmail = opts;
    return { messageId: 'mock-onboard-mail-id' };
  },
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

// Mock mongoose db connection
mongoose.connection.db = {
  collection: () => ({
    createIndex: async () => {},
    dropIndex: async () => {},
  }),
};
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

const User = require('../modules/admin/admin.model');
const Counter = require('../models/Counter.model');
const adminService = require('../modules/admin/admin.service');
const authService = require('../modules/auth/auth.service');
const repository = require('../modules/auth/auth.repository');
const tokens = require('../modules/auth/auth.tokens');

test('End-to-End Onboarding: Create User -> Welcome Email -> Temp Password Login -> Mandatory Replacement -> Final Login', async (t) => {
  const inMemoryDb = new Map();
  let counterSeq = 50;

  const origCreate = User.create;
  const origFindOne = User.findOne;
  const origFindById = User.findById;
  const origFindByIdAndUpdate = User.findByIdAndUpdate;
  const origFindOneAndUpdate = User.findOneAndUpdate;
  const origCounterFindOneAndUpdate = Counter.findOneAndUpdate;
  const origRepoFindByIdentifier = repository.findByIdentifier;
  const origRepoFindById = repository.findById;
  const origRepoConsume = repository.consumeTemporaryPassword;
  const origRepoReplace = repository.replacePassword;

  Counter.findOneAndUpdate = async () => {
    counterSeq += 1;
    return { seq: counterSeq };
  };

  User.create = async (doc) => {
    const id = new mongoose.Types.ObjectId().toString();
    const created = {
      _id: id,
      ...doc,
      createdAt: new Date(),
      updatedAt: new Date(),
      toObject: function () { return { ...this }; },
    };
    inMemoryDb.set(id, created);
    inMemoryDb.set(created.email.toLowerCase(), created);
    inMemoryDb.set(created.userId.toUpperCase(), created);
    return created;
  };

  User.findOne = (query) => {
    let found = null;
    if (query.email) {
      found = inMemoryDb.get(query.email.toLowerCase()) || null;
    } else if (query.$or) {
      for (const cond of query.$or) {
        if (cond.userId && inMemoryDb.has(cond.userId.toUpperCase())) {
          found = inMemoryDb.get(cond.userId.toUpperCase());
          break;
        }
        if (cond.email && inMemoryDb.has(cond.email.toLowerCase())) {
          found = inMemoryDb.get(cond.email.toLowerCase());
          break;
        }
      }
    }
    return {
      select: () => found ? { ...found } : null,
      then: (resolve) => resolve(found ? { ...found } : null),
    };
  };

  User.findById = (id) => ({
    select: () => {
      const u = inMemoryDb.get(String(id));
      return u ? { ...u } : null;
    },
  });

  User.findByIdAndUpdate = (id, update) => {
    const u = inMemoryDb.get(String(id));
    if (u && update.$set) {
      Object.assign(u, update.$set);
    }
    const doc = u ? { ...u } : null;
    return {
      select: () => doc,
      then: (resolve) => resolve(doc),
    };
  };

  User.findOneAndUpdate = (query, update) => {
    const u = inMemoryDb.get(String(query._id));
    if (u && update.$set) {
      Object.assign(u, update.$set);
    }
    return {
      select: () => u ? { ...u } : null,
      then: (resolve) => resolve(u ? { ...u } : null),
    };
  };

  repository.findByIdentifier = async (ident) => {
    const norm = String(ident).trim();
    if (inMemoryDb.has(norm.toUpperCase())) return { ...inMemoryDb.get(norm.toUpperCase()) };
    if (inMemoryDb.has(norm.toLowerCase())) return { ...inMemoryDb.get(norm.toLowerCase()) };
    return null;
  };

  repository.findById = async (id) => {
    const u = inMemoryDb.get(String(id));
    return u ? { ...u } : null;
  };

  repository.consumeTemporaryPassword = async (user) => {
    const u = inMemoryDb.get(String(user._id));
    if (u) {
      u.passwordChangeStartedAt = new Date();
      return { ...u };
    }
    return null;
  };

  repository.replacePassword = async (user, newHash) => {
    const u = inMemoryDb.get(String(user._id));
    if (u) {
      u.password = newHash;
      u.mustChangePassword = false;
      u.passwordChangeStartedAt = null;
      u.tempPasswordExpiresAt = null;
      u.activeSessionId = null;
      u.lastActivity = null;
      return { ...u };
    }
    return null;
  };

  t.after(() => {
    User.create = origCreate;
    User.findOne = origFindOne;
    User.findById = origFindById;
    User.findByIdAndUpdate = origFindByIdAndUpdate;
    User.findOneAndUpdate = origFindOneAndUpdate;
    Counter.findOneAndUpdate = origCounterFindOneAndUpdate;
    repository.findByIdentifier = origRepoFindByIdentifier;
    repository.findById = origRepoFindById;
    repository.consumeTemporaryPassword = origRepoConsume;
    repository.replacePassword = origRepoReplace;
  });

  // =========================================================================
  // STEP 1: Admin Creates New User
  // =========================================================================
  lastSentEmail = null;
  const newUserPayload = {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@tbi.org',
    role: 'T1_VOLUNTEER',
    phone: '+919876543210',
  };

  const createResult = await adminService.createUser(newUserPayload, 'SUPER_ADMIN');

  assert.ok(createResult.user, 'Created user must be returned');
  assert.equal(createResult.user.name, 'Aarav Sharma');
  assert.equal(createResult.user.email, 'aarav.sharma@tbi.org');
  assert.ok(createResult.user.userId, 'Sequential User ID must be generated');
  assert.ok(createResult.tempPassword, 'Temporary password must be returned to admin on creation');

  const generatedUserId = createResult.user.userId;
  const generatedTempPassword = createResult.tempPassword;

  // Verify welcome email content
  assert.ok(lastSentEmail, 'Welcome email must be sent');
  assert.equal(lastSentEmail.to, 'aarav.sharma@tbi.org');
  assert.ok(lastSentEmail.html.includes(generatedUserId), 'Email must contain User ID');
  assert.ok(lastSentEmail.html.includes(generatedTempPassword), 'Email must contain Temporary Password');

  // =========================================================================
  // STEP 2: User Logs In with User ID and Temp Password
  // =========================================================================
  const tempLoginResult = await authService.login(generatedUserId, generatedTempPassword);

  assert.equal(tempLoginResult.mustChangePassword, true, 'First login must flag mustChangePassword');
  assert.ok(tempLoginResult.passwordChangeToken, 'Must issue passwordChangeToken');
  assert.equal(tempLoginResult.accessToken, undefined, 'Access token must NOT be issued before password replacement');

  const passwordChangeToken = tempLoginResult.passwordChangeToken;

  // =========================================================================
  // STEP 3: User Sets Their New Permanent Password
  // =========================================================================
  const decodedToken = tokens.verify(passwordChangeToken, 'password-change');
  const newPermanentPassword = 'MySecurePassword2026!';

  const changeResult = await authService.changePassword(
    decodedToken,
    undefined, // Old password not required in forced first-login flow
    newPermanentPassword,
    { ip: '127.0.0.1' }
  );

  assert.equal(changeResult.success, true, 'Password change must succeed');

  // =========================================================================
  // STEP 4: Old Temporary Password Is Now Inactive
  // =========================================================================
  await assert.rejects(
    () => authService.login(generatedUserId, generatedTempPassword),
    /invalid credentials/i,
    'Old temporary password must be rejected after replacement'
  );

  // =========================================================================
  // STEP 5: New User Logs in with New Permanent Password
  // =========================================================================
  const finalLoginResult = await authService.login(generatedUserId, newPermanentPassword);

  assert.ok(finalLoginResult.accessToken, 'Regular login must return accessToken');
  assert.ok(finalLoginResult.refreshToken, 'Regular login must return refreshToken');
  assert.equal(finalLoginResult.user.mustChangePassword, false, 'mustChangePassword must be false');
  assert.equal(finalLoginResult.user.userId, generatedUserId);
  assert.equal(finalLoginResult.user.email, 'aarav.sharma@tbi.org');
});
