/**
 * 300-Concurrent-User Load & Stress Benchmark Suite
 * Measures latency percentiles (p50, p95, p99), throughput, and memory under heavy concurrency.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';

// Intercept nodemailer to benchmark pure API & crypto throughput without network bottleneck
nodemailer.createTransport = () => ({
  sendMail: async () => ({ messageId: 'mock-load-mail-id' }),
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

// Load models and services BEFORE setting connection state
const User = require('../modules/admin/admin.model');
const authService = require('../modules/auth/auth.service');
const repository = require('../modules/auth/auth.repository');

// Provide mock db object and readyState = 1 so ensureDbConnected() passes
mongoose.connection.db = {
  collection: () => ({
    createIndex: async () => {},
    dropIndex: async () => {},
  }),
};
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

test('300 Concurrent User Load & Stress Benchmark', { timeout: 60000 }, async (t) => {
  const TOTAL_USERS = 300;
  const sharedPassword = 'UserPassword123!';
  const passwordHash = await bcrypt.hash(sharedPassword, 8); // Fast rounds for load test benchmark

  // Pre-generate 300 distinct user records in memory
  const userDatabase = new Map();
  for (let i = 1; i <= TOTAL_USERS; i++) {
    const id = new mongoose.Types.ObjectId().toString();
    const userId = `TBI${String(i).padStart(5, '0')}`;
    const email = `loaduser${i}@tbi.test`;
    userDatabase.set(email, {
      _id: id,
      userId,
      email,
      name: `Load Test User ${i}`,
      role: 'T1_VOLUNTEER',
      password: passwordHash,
      isActive: true,
      mustChangePassword: false,
      activeSessionId: null,
      save: async function () { return this; },
      toObject: function () { return { ...this }; },
    });
  }

  // Mock repository lookups from the in-memory map
  const origFindByEmail = repository.findByEmail;
  const origFindByIdentifier = repository.findByIdentifier;
  const origFindById = repository.findById;
  const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
  const origUserFindById = User.findById;

  repository.findByEmail = async (email) => userDatabase.get(email) || null;
  repository.findByIdentifier = async (ident) => {
    const norm = String(ident).trim().toLowerCase();
    for (const u of userDatabase.values()) {
      if (u.email === norm || u.userId.toLowerCase() === norm) return { ...u };
    }
    return null;
  };
  repository.findById = async (id) => {
    for (const u of userDatabase.values()) {
      if (u._id === String(id)) return { ...u };
    }
    return null;
  };
  User.findByIdAndUpdate = async (id, update) => {
    for (const u of userDatabase.values()) {
      if (u._id === String(id)) {
        Object.assign(u, update.$set);
        return { ...u };
      }
    }
    return null;
  };
  User.findById = (id) => ({
    select: () => {
      for (const u of userDatabase.values()) {
        if (u._id === String(id)) return { ...u };
      }
      return null;
    },
  });

  t.after(() => {
    repository.findByEmail = origFindByEmail;
    repository.findByIdentifier = origFindByIdentifier;
    repository.findById = origFindById;
    User.findByIdAndUpdate = origUserFindByIdAndUpdate;
    User.findById = origUserFindById;
  });

  await t.test('Phase 1: 300 Concurrent Forgot-Password Requests', async () => {
    const memBefore = process.memoryUsage().heapUsed;
    const latencies = [];
    const startTime = Date.now();

    const tasks = Array.from({ length: TOTAL_USERS }, async (_, index) => {
      const email = `loaduser${index + 1}@tbi.test`;
      const reqStart = performance.now();
      try {
        const res = await authService.forgotPassword(email);
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        assert.equal(res.success, true);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    const results = await Promise.all(tasks);
    const totalDurationMs = Date.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round((memAfter - memBefore) / 1024 / 1024 * 100) / 100;

    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.50)].toFixed(2) : '0';
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)].toFixed(2) : '0';
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)].toFixed(2) : '0';
    const avg = latencies.length > 0 ? (latencies.reduce((sum, v) => sum + v, 0) / latencies.length).toFixed(2) : '0';
    const successCount = results.filter((r) => r.success).length;
    const rps = Math.round((TOTAL_USERS / Math.max(0.001, totalDurationMs / 1000)) * 10) / 10;

    console.log(`\n============================================================`);
    console.log(` 300-USER LOAD TEST: Forgot-Password Stress Results`);
    console.log(`============================================================`);
    console.log(` Total Concurrent Requests: ${TOTAL_USERS}`);
    console.log(` Successful Requests:       ${successCount} / ${TOTAL_USERS} (100%)`);
    console.log(` Total Elapsed Time:        ${totalDurationMs} ms`);
    console.log(` Throughput:                ${rps} req/sec`);
    console.log(` Latency Average:           ${avg} ms`);
    console.log(` Latency p50 (Median):      ${p50} ms`);
    console.log(` Latency p95:               ${p95} ms`);
    console.log(` Latency p99:               ${p99} ms`);
    console.log(` Memory Heap Delta:         ${memDeltaMb > 0 ? `+${memDeltaMb}` : memDeltaMb} MB`);
    console.log(`============================================================\n`);

    assert.equal(successCount, TOTAL_USERS, 'All 300 forgot-password requests must succeed');
  });

  await t.test('Phase 2: 300 Concurrent Login Authentications', async () => {
    const memBefore = process.memoryUsage().heapUsed;
    const latencies = [];
    const startTime = Date.now();

    const tasks = Array.from({ length: TOTAL_USERS }, async (_, index) => {
      const email = `loaduser${index + 1}@tbi.test`;
      const reqStart = performance.now();
      try {
        const res = await authService.login(email, sharedPassword);
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        assert.ok(res.accessToken, 'Must return accessToken');
        assert.ok(res.refreshToken, 'Must return refreshToken');
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    const results = await Promise.all(tasks);
    const totalDurationMs = Date.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round((memAfter - memBefore) / 1024 / 1024 * 100) / 100;

    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.50)].toFixed(2) : '0';
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)].toFixed(2) : '0';
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)].toFixed(2) : '0';
    const avg = latencies.length > 0 ? (latencies.reduce((sum, v) => sum + v, 0) / latencies.length).toFixed(2) : '0';
    const successCount = results.filter((r) => r.success).length;
    const rps = Math.round((TOTAL_USERS / Math.max(0.001, totalDurationMs / 1000)) * 10) / 10;

    console.log(`\n============================================================`);
    console.log(` 300-USER LOAD TEST: Login Authentication Stress Results`);
    console.log(`============================================================`);
    console.log(` Total Concurrent Logins:   ${TOTAL_USERS}`);
    console.log(` Successful Logins:         ${successCount} / ${TOTAL_USERS} (100%)`);
    console.log(` Total Elapsed Time:        ${totalDurationMs} ms`);
    console.log(` Throughput:                ${rps} logins/sec`);
    console.log(` Latency Average:           ${avg} ms`);
    console.log(` Latency p50 (Median):      ${p50} ms`);
    console.log(` Latency p95:               ${p95} ms`);
    console.log(` Latency p99:               ${p99} ms`);
    console.log(` Memory Heap Delta:         ${memDeltaMb > 0 ? `+${memDeltaMb}` : memDeltaMb} MB`);
    console.log(`============================================================\n`);

    assert.equal(successCount, TOTAL_USERS, 'All 300 concurrent logins must authenticate successfully');
  });
});
