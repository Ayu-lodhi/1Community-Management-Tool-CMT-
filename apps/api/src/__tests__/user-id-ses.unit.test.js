const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

// Intercept nodemailer before requiring email services so no network calls are made
const capturedMails = [];
nodemailer.createTransport = () => ({
  sendMail: async (mailOptions) => {
    capturedMails.push(mailOptions);
    return { messageId: 'mock-mail-id' };
  },
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

// Load models and services before tweaking any connection states
const { getNextUserId, _resetFallbackSeq } = require('../services/userId.service');
const User = require('../modules/admin/admin.model');
const Counter = require('../models/Counter.model');
const authService = require('../modules/auth/auth.service');
const repository = require('../modules/auth/auth.repository');
const adminService = require('../modules/admin/admin.service');
const { sendWelcomeEmail } = require('../services/email.service');
const { backfillUserIds } = require('../../../../scripts/backfill-user-ids');

// ============================================================================
// 1. UNIQUE AND CONCURRENT USER ID GENERATION
// ============================================================================
test('1. User ID generator: generates unique sequential IDs and handles concurrency', async () => {
  _resetFallbackSeq(0);

  // Generate 20 IDs concurrently
  const promises = Array.from({ length: 20 }, () => getNextUserId('TBI'));
  const ids = await Promise.all(promises);

  assert.equal(ids.length, 20);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, 20, 'All generated User IDs must be unique');

  // Verify pattern: TBI + 5 digits
  ids.forEach((id) => {
    assert.match(id, /^TBI\d{5}$/, `ID "${id}" must match prefix + 5-digit format`);
  });
});

// ============================================================================
// 2. ID IMMUTABILITY
// ============================================================================
test('2. User ID immutability: userId field is immutable and cannot be modified', async () => {
  const userIdPath = User.schema.path('userId');
  assert.ok(userIdPath, 'userId must exist on User schema');
  assert.equal(userIdPath.options.immutable, true, 'userId schema option must be immutable');
  assert.equal(userIdPath.options.uppercase, true, 'userId schema option must uppercase values');

  // Verify authService.updateProfile ignores userId
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    userId: 'TBI00001',
    name: 'Original Name',
    email: 'test@tbi.test',
    role: 'T1_VOLUNTEER',
    phone: '',
    skills: [],
    bio: '',
    availability: '',
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  };

  const origFindById = User.findById;
  User.findById = () => ({
    ...mockUser,
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  });

  try {
    const updated = await authService.updateProfile(mockUser._id, {
      userId: 'TBI99999',
      name: 'New Name',
    });
    assert.equal(updated.name, 'New Name');
    assert.equal(updated.userId, 'TBI00001', 'userId must not be updated by profile update endpoint');
  } finally {
    User.findById = origFindById;
  }
});

// ============================================================================
// 3. NO REUSE AFTER DELETION
// ============================================================================
test('3. User ID generator: no reuse of sequence after record deletion', async () => {
  _resetFallbackSeq(100);

  const id1 = await getNextUserId('TBI');
  assert.equal(id1, 'TBI00101');

  // Simulate user created with id1 and then deleted
  // Next generated ID must increment monotonically, never reusing id1
  const id2 = await getNextUserId('TBI');
  assert.equal(id2, 'TBI00102');
  assert.notEqual(id1, id2, 'Deleted or existing ID sequence must never be reused');
});

// ============================================================================
// 4. LOGIN BY ID AND BY EMAIL
// ============================================================================
test('4. Login: authenticates successfully by User ID and by Email', async () => {
  const origReady = mongoose.connection.readyState;
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

  const password = 'SecurePassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = 'TBI00005';
  const email = 'member@tbi.test';

  const mockUserDoc = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    email,
    password: hashedPassword,
    role: 'T1_VOLUNTEER',
    isActive: true,
    mustChangePassword: false,
    activeSessionId: null,
  };

  const origFindByIdentifier = repository.findByIdentifier;
  const origFindByIdAndUpdate = User.findByIdAndUpdate;

  repository.findByIdentifier = async (ident) => {
    const normalized = String(ident).trim();
    if (normalized.toUpperCase() === userId || normalized.toLowerCase() === email) {
      return { ...mockUserDoc };
    }
    return null;
  };

  User.findByIdAndUpdate = async (_id, update) => {
    const updated = { ...mockUserDoc, ...update.$set };
    return updated;
  };

  try {
    // 1. Login by Email
    const emailLoginRes = await authService.login(email, password);
    assert.ok(emailLoginRes.accessToken, 'Login by email must return accessToken');
    assert.equal(emailLoginRes.user.email, email);
    assert.equal(emailLoginRes.user.userId, userId);

    // 2. Login by User ID (exact uppercase)
    const idLoginRes = await authService.login(userId, password);
    assert.ok(idLoginRes.accessToken, 'Login by userId must return accessToken');
    assert.equal(idLoginRes.user.userId, userId);

    // 3. Login by User ID (lowercase input normalized)
    const lowerIdLoginRes = await authService.login('tbi00005', password);
    assert.ok(lowerIdLoginRes.accessToken, 'Login by lowercase userId must return accessToken');
    assert.equal(lowerIdLoginRes.user.userId, userId);
  } finally {
    repository.findByIdentifier = origFindByIdentifier;
    User.findByIdAndUpdate = origFindByIdAndUpdate;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReady, configurable: true });
  }
});

// ============================================================================
// 5. UNIFORM ERROR MESSAGE FOR BOTH FAILURE TYPES
// ============================================================================
test('5. Authentication: wrong identifier and wrong password return identical error message', async () => {
  const origReady = mongoose.connection.readyState;
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

  const password = 'RealPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  const origFindByIdentifier = repository.findByIdentifier;
  repository.findByIdentifier = async (ident) => {
    if (ident === 'exists@tbi.test' || ident === 'TBI00001') {
      return {
        _id: new mongoose.Types.ObjectId(),
        email: 'exists@tbi.test',
        userId: 'TBI00001',
        password: hashedPassword,
        isActive: true,
      };
    }
    return null;
  };

  try {
    // Case A: Identifier does not exist
    await assert.rejects(
      async () => {
        await authService.login('nonexistent@tbi.test', 'anypassword');
      },
      (err) => {
        assert.equal(err.message, 'Invalid credentials');
        return true;
      }
    );

    // Case B: Identifier exists, but password is wrong
    await assert.rejects(
      async () => {
        await authService.login('exists@tbi.test', 'WrongPassword!');
      },
      (err) => {
        assert.equal(err.message, 'Invalid credentials');
        return true;
      }
    );

    // Case C: User ID exists, but password is wrong
    await assert.rejects(
      async () => {
        await authService.login('TBI00001', 'WrongPassword!');
      },
      (err) => {
        assert.equal(err.message, 'Invalid credentials');
        return true;
      }
    );
  } finally {
    repository.findByIdentifier = origFindByIdentifier;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReady, configurable: true });
  }
});

// ============================================================================
// 6. BULK IMPORT ASSIGNS UNIQUE IDS
// ============================================================================
test('6. Bulk Import: assigns unique User IDs to each imported user row', async () => {
  _resetFallbackSeq(200);

  const origFindOne = User.findOne;
  const origCreate = User.create;
  const createdUsers = [];

  User.findOne = async () => null; // No duplicate emails
  User.create = async (doc) => {
    const created = {
      _id: new mongoose.Types.ObjectId(),
      ...doc,
      toObject: function () { return { ...this }; },
    };
    createdUsers.push(created);
    return created;
  };

  const rows = [
    { name: 'Imported User One', email: 'user1@tbi.test', role: 'T1_VOLUNTEER' },
    { name: 'Imported User Two', email: 'user2@tbi.test', role: 'T1_VOLUNTEER' },
    { name: 'Imported User Three', email: 'user3@tbi.test', role: 'T1_VOLUNTEER' },
  ];

  try {
    const result = await adminService.bulkCreateUsers(rows, 'ADMIN');
    assert.equal(result.succeeded, 3);
    assert.equal(createdUsers.length, 3);

    const assignedIds = createdUsers.map((u) => u.userId);
    const uniqueIds = new Set(assignedIds);
    assert.equal(uniqueIds.size, 3, 'All bulk imported users must have unique User IDs');
    assignedIds.forEach((id) => {
      assert.match(id, /^TBI\d{5}$/, `Bulk import ID "${id}" must match User ID format`);
    });
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

// ============================================================================
// 7. BACKFILL DRY-RUN AND IDEMPOTENCY
// ============================================================================
test('7. Backfill script: dry-run mode and idempotent execution', async () => {
  _resetFallbackSeq(500);

  const mockDbUsers = [
    { _id: '1', createdAt: new Date('2026-01-01'), userId: undefined },
    { _id: '2', createdAt: new Date('2026-01-02'), userId: null },
    { _id: '3', createdAt: new Date('2026-01-03'), userId: 'TBI00001' }, // already has ID
  ];

  const updateCalls = [];

  const mockUserModel = {
    countDocuments: async () => mockDbUsers.length,
    find: (filter) => {
      const matching = mockDbUsers.filter((u) => !u.userId);
      return {
        sort: () => ({
          select: () => Promise.resolve(matching),
        }),
      };
    },
    updateOne: async (filter, update) => {
      updateCalls.push({ filter, update });
      const target = mockDbUsers.find((u) => u._id === filter._id);
      if (target) {
        target.userId = update.$set.userId;
      }
      return { modifiedCount: 1 };
    },
  };

  const logs = [];
  const testLogger = (msg) => logs.push(msg);

  // 1. Dry-run mode: should not write to database
  const dryRunRes = await backfillUserIds({
    apply: false,
    userModel: mockUserModel,
    logger: testLogger,
  });

  assert.equal(dryRunRes.mode, 'dry-run');
  assert.equal(dryRunRes.needingBackfill, 2);
  assert.equal(dryRunRes.applied, 0);
  assert.equal(updateCalls.length, 0, 'Dry-run must not execute any updateOne writes');

  // 2. Apply mode: should assign IDs to users missing one
  const applyRes = await backfillUserIds({
    apply: true,
    userModel: mockUserModel,
    logger: testLogger,
  });

  assert.equal(applyRes.mode, 'apply');
  assert.equal(applyRes.needingBackfill, 2);
  assert.equal(applyRes.applied, 2);
  assert.equal(updateCalls.length, 2, 'Apply mode must execute updateOne for each missing record');
  assert.equal(mockDbUsers[0].userId, 'TBI00501');
  assert.equal(mockDbUsers[1].userId, 'TBI00502');
  assert.equal(mockDbUsers[2].userId, 'TBI00001', 'Existing ID was not overwritten');

  // 3. Idempotent re-run: all users now have IDs
  const idempotentRes = await backfillUserIds({
    apply: true,
    userModel: mockUserModel,
    logger: testLogger,
  });

  assert.equal(idempotentRes.needingBackfill, 0);
  assert.equal(idempotentRes.applied, 0, 'Second run must skip all users (idempotent)');
});

// ============================================================================
// 8. EMAIL CONTAINS ID, VALIDITY, ESCAPED HTML, AND NEVER LOGS PASSWORD
// ============================================================================
test('8. Welcome email: contains User ID, 7-day validity, escapes HTML, and never logs password', async () => {
  // Clear any previously captured emails
  capturedMails.length = 0;

  // Intercept console logging to verify password is never printed
  const capturedLogs = [];
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;

  const captureInterceptor = (...args) => {
    capturedLogs.push(args.join(' '));
  };

  console.log = captureInterceptor;
  console.info = captureInterceptor;
  console.warn = captureInterceptor;
  console.error = captureInterceptor;

  const sensitiveTempPassword = 'SuperSecretTempPassword987!';
  const xssPayloadName = '<script>alert("xss")</script>';

  try {
    const result = await sendWelcomeEmail({
      to: 'recipient@tbi.test',
      name: xssPayloadName,
      role: 'T1_VOLUNTEER',
      tempPassword: sensitiveTempPassword,
      loginUrl: 'https://portal.tbi.test/login',
      userId: 'TBI00099',
    });

    assert.equal(result.success, true);
    assert.ok(capturedMails.length > 0, 'Email must have been sent via transport');
    const sentMail = capturedMails[capturedMails.length - 1];

    // 1. Email contains User ID
    assert.match(sentMail.html, /TBI00099/, 'Email HTML must display the User ID');
    assert.match(sentMail.text, /TBI00099/, 'Plain text email must include the User ID');

    // 2. Email contains 7-day validity notice
    assert.match(sentMail.html, /7 days/, 'Email HTML must note 7-day temporary password validity');
    assert.match(sentMail.text, /7 days/, 'Plain text email must note 7-day validity');

    // 3. User-supplied values are HTML escaped
    assert.doesNotMatch(sentMail.html, /<script>alert\("xss"\)<\/script>/, 'Raw unescaped script tag must not be in HTML');
    assert.match(sentMail.html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/, 'User-supplied name must be HTML escaped');

    // 4. Console logs never leaked the temporary password
    const allLoggedText = capturedLogs.join('\n');
    assert.doesNotMatch(
      allLoggedText,
      new RegExp(sensitiveTempPassword),
      'Temporary password must never be logged to console'
    );
  } finally {
    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
  }
});
