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

function setupMockUsers() {
  const users = new Map([
    ['userA@example.com', {
      _id: '507f1f77bcf86cd799439011',
      name: 'User A',
      email: 'userA@example.com',
      role: 'T1_VOLUNTEER',
      password: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      isActive: true,
      activeSessionId: null,
      lastActivity: null,
      mustChangePassword: false,
      passwordChangeStartedAt: null,
    }],
    ['userB@example.com', {
      _id: '507f1f77bcf86cd799439022',
      name: 'User B',
      email: 'userB@example.com',
      role: 'T2_ASSOCIATE',
      password: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      isActive: true,
      activeSessionId: null,
      lastActivity: null,
      mustChangePassword: false,
      passwordChangeStartedAt: null,
    }],
    ['userC@example.com', {
      _id: '507f1f77bcf86cd799439033',
      name: 'User C',
      email: 'userC@example.com',
      role: 'T3_EXECUTIVE',
      password: '$2a$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      isActive: true,
      activeSessionId: null,
      lastActivity: null,
      mustChangePassword: false,
      passwordChangeStartedAt: null,
    }],
  ]);

  const origFindByEmail = repository.findByEmail;
  const origFindById = repository.findById;
  const origFindByIdAndUpdate = User.findByIdAndUpdate;
  const origUpdateOne = User.updateOne;
  const origBcryptCompare = bcrypt.compare;
  const originalState = mongoose.connection.readyState;

  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  repository.findByEmail = async (email) => users.get(email) || null;
  repository.findById = async (id) => {
    for (const u of users.values()) {
      if (u._id === id || String(u._id) === String(id)) return u;
    }
    return null;
  };
  bcrypt.compare = async () => true;

  User.findByIdAndUpdate = async (id, update) => {
    for (const u of users.values()) {
      if (u._id === id || String(u._id) === String(id)) {
        if (update.$set) Object.assign(u, update.$set);
        return { ...u };
      }
    }
    return null;
  };

  User.updateOne = async (filter, update) => {
    for (const u of users.values()) {
      if (u._id === filter._id || String(u._id) === String(filter._id)) {
        if (update.$set) Object.assign(u, update.$set);
        return { acknowledged: true, modifiedCount: 1 };
      }
    }
    return { acknowledged: true, modifiedCount: 0 };
  };

  const cleanup = () => {
    repository.findByEmail = origFindByEmail;
    repository.findById = origFindById;
    User.findByIdAndUpdate = origFindByIdAndUpdate;
    User.updateOne = origUpdateOne;
    bcrypt.compare = origBcryptCompare;
    Object.defineProperty(mongoose.connection, 'readyState', { value: originalState, configurable: true });
  };

  return { users, getUser: (email) => users.get(email), cleanup };
}

// 1. A valid access token with a matching session: 200.
test('1. A valid access token with a matching session returns authenticated user', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const loginRes = await authService.login('userA@example.com', 'password');
    const auth = await authenticateToken(loginRes.accessToken);
    const user = getUser('userA@example.com');
    assert.equal(auth.sub, user._id);
    assert.equal(auth.email, user.email);
  } finally {
    cleanup();
  }
});

// 2. Logout, then reuse the old access token: 401 "Session ended. Please log in again."
test('2. Logout, then reuse the old access token returns 401 Session ended', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    const loginRes = await authService.login('userA@example.com', 'password');
    assert.ok(user.activeSessionId);

    // User logs out
    await authService.logout(user._id);
    assert.equal(user.activeSessionId, null);

    // Reusing the token must fail with 401
    await assert.rejects(
      async () => {
        await authenticateToken(loginRes.accessToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Session ended. Please log in again.');
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

// 3. Super-admin terminates user's session, then old token is used: 401
test('3. Super-admin terminates session then old token returns 401 Session ended', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    const loginRes = await authService.login('userA@example.com', 'password');
    assert.ok(user.activeSessionId);

    // Super-admin terminates user session (DELETE /super-admin/sessions/:id)
    await User.findByIdAndUpdate(user._id, { $set: { activeSessionId: null, lastActivity: null } });
    assert.equal(user.activeSessionId, null);

    // Reusing the token must fail with 401
    await assert.rejects(
      async () => {
        await authenticateToken(loginRes.accessToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Session ended. Please log in again.');
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

// 4. A second login invalidates the first token: 401
test('4. A second login invalidates the first token (returns 401)', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    const login1 = await authService.login('userA@example.com', 'password');
    const login2 = await authService.login('userA@example.com', 'password');

    // First token must fail with 401
    await assert.rejects(
      async () => {
        await authenticateToken(login1.accessToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Session ended. Please log in again.');
        return true;
      }
    );

    // Second token succeeds
    const auth2 = await authenticateToken(login2.accessToken);
    assert.equal(auth2.sub, user._id);
  } finally {
    cleanup();
  }
});

// 5. An access token with no sid: 401
test('5. An access token with no sid is rejected with 401', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    await authService.login('userA@example.com', 'password');
    assert.ok(user.activeSessionId);

    // Sign access token without sid
    const tokenNoSid = tokens.sign(user, 'access', '15m', { role: user.role });

    await assert.rejects(
      async () => {
        await authenticateToken(tokenNoSid);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Session ended. Please log in again.');
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

// 6. A stale password-change token (its sid does not match activeSessionId): 401
test('6. A stale password-change token (sid does not match activeSessionId) returns 401', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    user.mustChangePassword = true;
    user.passwordChangeStartedAt = new Date();
    user.activeSessionId = 'current-active-session-id';

    // Sign password-change token with a different (stale) sid
    const staleChangeToken = tokens.sign(user, 'password-change', '5m', {
      isMfaVerified: true,
      sid: 'stale-old-session-id',
    });

    await assert.rejects(
      async () => {
        await authenticateToken(staleChangeToken, true);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Session ended. Please log in again.');
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

// 7. A valid password-change token with a matching session: accepted
test('7. A valid password-change token with a matching session is accepted', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    user.mustChangePassword = true;
    user.passwordChangeStartedAt = new Date();
    user.activeSessionId = 'matching-session-id';

    const validChangeToken = tokens.sign(user, 'password-change', '5m', {
      isMfaVerified: true,
      sid: 'matching-session-id',
    });

    const decoded = await authenticateToken(validChangeToken, true);
    assert.equal(decoded.sub, user._id);
    assert.equal(decoded.purpose, 'password-change');
  } finally {
    cleanup();
  }
});

// 8. Socket handshake with a revoked token: rejected
test('8. Socket handshake with a revoked token is rejected', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const user = getUser('userA@example.com');
    const loginRes = await authService.login('userA@example.com', 'password');

    // Revoke session
    await authService.logout(user._id);

    // Simulate socket.io io.use handshake middleware logic
    const socket = {
      handshake: {
        auth: { token: loginRes.accessToken },
      },
    };

    let middlewareErr = null;
    try {
      await authenticateToken(socket.handshake.auth.token);
    } catch (err) {
      middlewareErr = err;
    }

    assert.ok(middlewareErr, 'Socket handshake must fail for revoked token');
    assert.equal(middlewareErr.statusCode, 401);
    assert.equal(middlewareErr.message, 'Session ended. Please log in again.');
  } finally {
    cleanup();
  }
});

// 9. Users B and C stay logged in when user A logs out
test('9. Users B and C stay logged in when user A logs out', async () => {
  const { getUser, cleanup } = setupMockUsers();
  try {
    const loginA = await authService.login('userA@example.com', 'password');
    const loginB = await authService.login('userB@example.com', 'password');
    const loginC = await authService.login('userC@example.com', 'password');

    const userA = getUser('userA@example.com');
    const userB = getUser('userB@example.com');
    const userC = getUser('userC@example.com');

    // All 3 tokens initially valid
    assert.equal((await authenticateToken(loginA.accessToken)).sub, userA._id);
    assert.equal((await authenticateToken(loginB.accessToken)).sub, userB._id);
    assert.equal((await authenticateToken(loginC.accessToken)).sub, userC._id);

    // User A logs out
    await authService.logout(userA._id);
    assert.equal(userA.activeSessionId, null);
    assert.ok(userB.activeSessionId, 'User B session must remain intact');
    assert.ok(userC.activeSessionId, 'User C session must remain intact');

    // User A's token is rejected
    await assert.rejects(
      async () => {
        await authenticateToken(loginA.accessToken);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Session ended. Please log in again.');
        return true;
      }
    );

    // Users B and C can still authenticate cleanly
    const authB = await authenticateToken(loginB.accessToken);
    assert.equal(authB.sub, userB._id);
    assert.equal(authB.email, userB.email);

    const authC = await authenticateToken(loginC.accessToken);
    assert.equal(authC.sub, userC._id);
    assert.equal(authC.email, userC.email);
  } finally {
    cleanup();
  }
});
