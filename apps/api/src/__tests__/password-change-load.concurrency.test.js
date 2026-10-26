/**
 * 350-Concurrent-User Load & Stress Benchmark Suite: Profile Password Change
 * Measures latency percentiles (p50, p95, p99), throughput, memory, and rate limiting under heavy concurrency.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';
process.env.BCRYPT_ROUNDS = '6';
process.env.JWT_ACCESS_SECRET = 'load_test_jwt_access_secret_32_characters_long_min';
process.env.JWT_REFRESH_SECRET = 'load_test_jwt_refresh_secret_32_characters_long_min';

// Intercept nodemailer to benchmark pure API & crypto throughput without network bottleneck
nodemailer.createTransport = () => ({
  sendMail: async () => ({ messageId: 'mock-load-mail-id' }),
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

const User = require('../modules/admin/admin.model');
const authService = require('../modules/auth/auth.service');
const repository = require('../modules/auth/auth.repository');
const tokens = require('../modules/auth/auth.tokens');
const { resetPasswordRateLimit } = require('../middleware/rateLimit.middleware');

// Provide mock db object and readyState = 1 so ensureDbConnected() passes
mongoose.connection.db = {
  collection: () => ({
    createIndex: async () => {},
    dropIndex: async () => {},
  }),
};
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

test('350 Concurrent User Password Change Load & Stress Benchmark', { timeout: 90000 }, async (t) => {
  const TOTAL_USERS = 350;
  const initialPassword = 'UserInitialPassword123!';
  const initialHash = await bcrypt.hash(initialPassword, 6);

  // Pre-generate 350 distinct user records in memory
  const userDatabase = new Map();
  for (let i = 1; i <= TOTAL_USERS; i++) {
    const id = new mongoose.Types.ObjectId().toString();
    const userId = `TBI${String(i).padStart(5, '0')}`;
    const email = `pwduser${i}@tbi.test`;
    userDatabase.set(id, {
      _id: id,
      userId,
      email,
      name: `Load User ${i}`,
      role: 'T1_VOLUNTEER',
      password: initialHash,
      isActive: true,
      mustChangePassword: false,
      activeSessionId: `sess-${id}`,
      lastActivity: new Date(),
      passwordChangeStartedAt: null,
      save: async function () { return this; },
      toObject: function () { return { ...this }; },
    });
  }

  const origFindById = repository.findById;
  const origReplacePassword = repository.replacePassword;
  const origUserFindById = User.findById;
  const origUserUpdateOne = User.updateOne;

  repository.findById = async (id) => {
    const u = userDatabase.get(String(id));
    return u ? { ...u } : null;
  };

  repository.replacePassword = async (user, newHash) => {
    const existing = userDatabase.get(String(user._id));
    if (existing) {
      existing.password = newHash;
      existing.activeSessionId = null;
      existing.lastActivity = null;
      existing.mustChangePassword = false;
      return { ...existing };
    }
    return null;
  };

  User.findById = (id) => ({
    select: () => {
      const u = userDatabase.get(String(id));
      return u ? { ...u } : null;
    },
  });

  User.updateOne = async (query, update) => {
    const id = String(query._id);
    const existing = userDatabase.get(id);
    if (existing && update.$set) {
      Object.assign(existing, update.$set);
    }
    return { acknowledged: true, modifiedCount: 1 };
  };

  t.after(() => {
    repository.findById = origFindById;
    repository.replacePassword = origReplacePassword;
    User.findById = origUserFindById;
    User.updateOne = origUserUpdateOne;
  });

  await t.test('Phase 1: 350 Concurrent Successful Password Changes', async () => {
    const memBefore = process.memoryUsage().heapUsed;
    const latencies = [];
    const startTime = Date.now();
    const userIds = Array.from(userDatabase.keys());

    const tasks = userIds.map(async (id, idx) => {
      const user = userDatabase.get(id);
      const newPassword = `BrandNewPass${idx + 1}Special!`;
      const cred = {
        sub: id,
        name: user.name,
        email: user.email,
        purpose: 'access',
        authState: tokens.authState(user),
      };

      const reqStart = performance.now();
      try {
        const res = await authService.changePassword(
          cred,
          initialPassword,
          newPassword,
          { ip: `10.0.${Math.floor(idx / 254)}.${(idx % 254) + 1}` }
        );
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        assert.equal(res.success, true);
        return { success: true, id, newPassword };
      } catch (err) {
        return { success: false, error: err.message, id };
      }
    });

    const results = await Promise.all(tasks);
    const totalDurationMs = Date.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round(((memAfter - memBefore) / 1024 / 1024) * 100) / 100;

    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)].toFixed(2) : '0';
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)].toFixed(2) : '0';
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)].toFixed(2) : '0';
    const avg = latencies.length > 0 ? (latencies.reduce((sum, v) => sum + v, 0) / latencies.length).toFixed(2) : '0';
    const successCount = results.filter((r) => r.success).length;
    const rps = Math.round((TOTAL_USERS / Math.max(0.001, totalDurationMs / 1000)) * 10) / 10;

    console.log(`\n============================================================`);
    console.log(` 350-USER LOAD TEST: Password Change Benchmark Results`);
    console.log(`============================================================`);
    console.log(` Total Concurrent Changes:  ${TOTAL_USERS}`);
    console.log(` Successful Changes:        ${successCount} / ${TOTAL_USERS} (100%)`);
    console.log(` Total Elapsed Time:        ${totalDurationMs} ms`);
    console.log(` Throughput:                ${rps} changes/sec`);
    console.log(` Latency Average:           ${avg} ms`);
    console.log(` Latency p50 (Median):      ${p50} ms`);
    console.log(` Latency p95:               ${p95} ms`);
    console.log(` Latency p99:               ${p99} ms`);
    console.log(` Memory Heap Delta:         ${memDeltaMb > 0 ? `+${memDeltaMb}` : memDeltaMb} MB`);
    console.log(`============================================================\n`);

    assert.equal(successCount, TOTAL_USERS, 'All 350 concurrent password changes must succeed');

    // Verify session invalidation for all 350 users
    for (const id of userIds) {
      const u = userDatabase.get(id);
      assert.strictEqual(u.activeSessionId, null, 'Active session must be cleared after password change');
      assert.strictEqual(u.lastActivity, null, 'Last activity must be cleared after password change');
    }
  });

  await t.test('Phase 2: Rate Limiting & CPU Protection Under 350 Burst Attacks', async () => {
    const attackerId = Array.from(userDatabase.keys())[0];
    const attackerUser = userDatabase.get(attackerId);
    const attackerIp = '198.51.100.42';
    resetPasswordRateLimit(attackerId, attackerIp);

    const cred = {
      sub: attackerId,
      name: attackerUser.name,
      email: attackerUser.email,
      purpose: 'access',
      authState: tokens.authState(attackerUser),
    };

    let throttledCount = 0;
    let rejectedAuthCount = 0;

    // Simulate 15 consecutive attempts from the same IP/user
    for (let i = 0; i < 15; i++) {
      try {
        await authService.changePassword(
          cred,
          'WrongGuessedPassword123!',
          'AttackerNewPassword1!',
          { ip: attackerIp }
        );
      } catch (err) {
        if (err.statusCode === 429 || /too many/i.test(err.message)) {
          throttledCount++;
        } else {
          rejectedAuthCount++;
        }
      }
    }

    assert.strictEqual(rejectedAuthCount, 5, 'Exactly 5 attempts must be processed before rate limiting');
    assert.strictEqual(throttledCount, 10, 'Subsequent 10 attempts must be throttled with HTTP 429');
    console.log(`Burst Protection: ${rejectedAuthCount} processed, ${throttledCount} blocked immediately by rate limiter.`);
  });
});
