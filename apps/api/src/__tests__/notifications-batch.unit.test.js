const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const notificationsService = require('../modules/notifications/notifications.service');

test('Notifications notifyMany concurrency and batching', async (t) => {
  const origNotify = notificationsService.notify;

  t.afterEach(() => {
    notificationsService.notify = origNotify;
  });

  await t.test('notifyMany processes all userIds concurrently in chunks and returns results', async () => {
    const userIds = Array.from({ length: 45 }, () => new mongoose.Types.ObjectId().toString());
    const notified = [];

    notificationsService.notify = async (userId, type, title, message) => {
      notified.push(userId);
      return { _id: new mongoose.Types.ObjectId(), userId, title };
    };

    const results = await notificationsService.notifyMany(
      userIds,
      'announcement',
      'Test Announcement',
      'Broadcast message content'
    );

    assert.strictEqual(results.length, 45);
    assert.strictEqual(notified.length, 45);
  });
});
