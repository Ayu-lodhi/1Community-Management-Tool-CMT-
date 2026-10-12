const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const authService = require('../modules/auth/auth.service');
const { authenticateToken } = require('../modules/auth/auth.middleware');
const tokens = require('../modules/auth/auth.tokens');
const repository = require('../modules/auth/auth.repository');
const User = require('../modules/admin/admin.model');
const bcrypt = require('bcryptjs');

test('Phase 3 - Login fails closed with 503 when database is disconnected or session update fails', async () => {
  // Ensure mongoose.connection.readyState !== 1 (0 is disconnected)
  const originalState = mongoose.connection.readyState;
  Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

  try {
    await assert.rejects(
      async () => {
        await authService.login('test@example.com', 'password123');
      },
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.match(err.message, /Service temporarily unavailable/);
        return true;
      }
    );
  } finally {
    Object.defineProperty(mongoose.connection, 'readyState', { value: originalState, configurable: true });
  }
});

test('Phase 3 - MFA verify fails closed with 503 when database is disconnected', async () => {
  const originalState = mongoose.connection.readyState;
  const challengeToken = tokens.sign(
    { _id: '507f1f77bcf86cd799439011', password: 'hash' },
    'mfa',
    '5m'
  );

  Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

  try {
    await assert.rejects(
      async () => {
        await authService.verifyMfa(challengeToken, '123456');
      },
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.match(err.message, /Service temporarily unavailable/);
        return true;
      }
    );
  } finally {
    Object.defineProperty(mongoose.connection, 'readyState', { value: originalState, configurable: true });
  }
});

test('Phase 3 - Successful login stores activeSessionId equal to token sid and enforces single session', async () => {
  let inMemoryUser = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Test User',
    email: 'test@example.com',
    role: 'T1',
    password: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
    isActive: true,
    activeSessionId: null,
    lastActivity: null,
    mustChangePassword: false,
  };

  const origFindByEmail = repository.findByEmail;
  const origFindById = repository.findById;
  const origFindByIdAndUpdate = User.findByIdAndUpdate;
  const origUpdateOne = User.updateOne;
  const origBcryptCompare = bcrypt.compare;
  const originalState = mongoose.connection.readyState;

  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  repository.findByEmail = async (email) => (email === inMemoryUser.email ? inMemoryUser : null);
  repository.findById = async (id) => (id === inMemoryUser._id ? inMemoryUser : null);
  bcrypt.compare = async () => true;

  User.findByIdAndUpdate = async (id, update, options) => {
    if (id === inMemoryUser._id) {
      if (update.$set) {
        Object.assign(inMemoryUser, update.$set);
      }
      return { ...inMemoryUser };
    }
    return null;
  };

  User.updateOne = async (filter, update) => {
    if (filter._id === inMemoryUser._id && update.$set) {
      Object.assign(inMemoryUser, update.$set);
    }
    return { acknowledged: true, modifiedCount: 1 };
  };

  try {
    // First login
    const loginResult1 = await authService.login('test@example.com', 'validPassword');
    assert.ok(loginResult1.accessToken);
    assert.ok(loginResult1.refreshToken);

    const decoded1 = tokens.verify(loginResult1.accessToken, 'access');
    assert.ok(decoded1.sid);
    assert.equal(inMemoryUser.activeSessionId, decoded1.sid, 'Stored activeSessionId must equal token sid');

    // Authenticate with first token -> should succeed
    const auth1 = await authenticateToken(loginResult1.accessToken);
    assert.equal(auth1.sub, inMemoryUser._id);

    // Second login (single session override)
    const loginResult2 = await authService.login('test@example.com', 'validPassword');
    const decoded2 = tokens.verify(loginResult2.accessToken, 'access');
    assert.notEqual(decoded1.sid, decoded2.sid, 'Second login must generate a new session ID');
    assert.equal(inMemoryUser.activeSessionId, decoded2.sid, 'Stored activeSessionId must now match second session ID');

    // Old token should now be rejected as ended session (401)
    await assert.rejects(
      async () => {
        await authenticateToken(loginResult1.accessToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /Session ended/);
        return true;
      }
    );

    // New token should be accepted
    const auth2 = await authenticateToken(loginResult2.accessToken);
    assert.equal(auth2.sub, inMemoryUser._id);
  } finally {
    repository.findByEmail = origFindByEmail;
    repository.findById = origFindById;
    User.findByIdAndUpdate = origFindByIdAndUpdate;
    User.updateOne = origUpdateOne;
    bcrypt.compare = origBcryptCompare;
    Object.defineProperty(mongoose.connection, 'readyState', { value: originalState, configurable: true });
  }
});

test('Phase 3 - Middleware authenticateToken denies with 503 when user lookup throws or DB disconnected', async () => {
  const dummyToken = tokens.sign(
    { _id: '507f1f77bcf86cd799439011', password: 'hash' },
    'access',
    '15m',
    { sid: 'session-123' }
  );

  const originalState = mongoose.connection.readyState;
  const origFindById = repository.findById;

  // Case 1: DB disconnected (readyState = 0)
  Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });
  await assert.rejects(
    async () => {
      await authenticateToken(dummyToken);
    },
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.match(err.message, /Service temporarily unavailable/);
      return true;
    }
  );

  // Case 2: DB throws unexpected error during findById
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  repository.findById = async () => {
    throw new Error('MongoNetworkTimeoutException');
  };

  await assert.rejects(
    async () => {
      await authenticateToken(dummyToken);
    },
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.match(err.message, /Service temporarily unavailable/);
      return true;
    }
  );

  // Restore
  repository.findById = origFindById;
  Object.defineProperty(mongoose.connection, 'readyState', { value: originalState, configurable: true });
});
