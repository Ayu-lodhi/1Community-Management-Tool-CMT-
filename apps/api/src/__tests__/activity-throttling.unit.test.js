const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const { touchUserActivity } = require('../modules/auth/auth.middleware');
const User = require('../modules/admin/admin.model');

test('touchUserActivity database write throttling', async (t) => {
  const origUpdateOne = User.updateOne;
  const origReadyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

  t.afterEach(() => {
    User.updateOne = origUpdateOne;
    if (origReadyState) {
      Object.defineProperty(mongoose.connection, 'readyState', origReadyState);
    }
  });

  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 1,
    configurable: true,
  });

  await t.test('skips database update if lastActivity was updated less than 60 seconds ago', async () => {
    let updateCalls = 0;
    User.updateOne = async () => {
      updateCalls++;
      return { acknowledged: true, modifiedCount: 1 };
    };

    const initialTime = new Date('2026-10-25T10:00:00.000Z');
    const user = {
      _id: new mongoose.Types.ObjectId().toString(),
      lastActivity: initialTime,
    };

    // First call: 10 seconds later (< 60s)
    const call1Time = new Date('2026-10-25T10:00:10.000Z');
    await touchUserActivity(user, call1Time);

    assert.strictEqual(updateCalls, 0, 'Database write should be throttled within 60s window');
    assert.strictEqual(user.lastActivity, call1Time, 'In-memory lastActivity must still be updated');

    // Second call: 65 seconds later (> 60s from initialTime)
    const call2Time = new Date('2026-10-25T10:01:05.000Z');
    await touchUserActivity(user, call2Time);

    assert.strictEqual(updateCalls, 1, 'Database write should execute once 60s threshold passes');
    assert.strictEqual(user.lastActivity, call2Time);
  });
});
