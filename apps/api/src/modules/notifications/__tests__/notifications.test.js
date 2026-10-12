const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../notifications.model');
const User = require('../../admin/admin.model');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));

test('notification read updates enforce recipient ownership through HTTP', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'notification-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const caller = {
    _id: id('1'), role: ROLES.T1_VOLUNTEER, isActive: true,
    password: 'fixture-hash', mustChangePassword: false,
  };
  const owned = { _id: id('a'), userId: caller._id, title: 'Owned', isRead: false };
  const foreign = { _id: id('b'), userId: id('2'), title: 'Foreign', isRead: false };
  const documents = [owned, foreign];
  let writes = [];
  // Keep routing, authentication and Mongoose casting real; replace only database IO.
  t.mock.method(User.collection, 'findOne', async () => caller);
  t.mock.method(Notification.collection, 'findOneAndUpdate', async (query, update) => {
    writes.push({ query, update });
    const document = documents.find((item) => Object.entries(query)
      .every(([key, value]) => String(item[key]) === String(value)));
    if (!document) return null;
    const before = { ...document };
    Object.assign(document, update.$set);
    return before;
  });

  const app = express();
  app.use(require('../../../middleware/security.middleware'));
  app.use('/api/v1/notifications', require('../notifications.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const request = (notificationId, options = {}) => fetch(
    `http://127.0.0.1:${server.address().port}/api/v1/notifications/${notificationId}/read${options.query || ''}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(options.noToken ? {} : { Authorization: `Bearer ${tokens.sign(caller, 'access', '5m')}` }),
      },
      body: JSON.stringify(options.body || {}),
    },
  );

  await t.test('unauthenticated callers cannot reach the update', async () => {
    assert.equal((await request(owned._id, { noToken: true })).status, 401);
    assert.deepEqual(writes, []);
    assert.equal(owned.isRead, false);
  });

  await t.test('another recipient cannot mark a notification read or spoof ownership', async () => {
    writes = [];
    const response = await request(foreign._id, {
      body: { userId: String(foreign.userId), sub: String(foreign.userId) },
      query: `?userId=${foreign.userId}`,
    });
    assert.equal(foreign.isRead, false);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { success: false, message: 'Notification not found' });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].query, { _id: foreign._id, userId: caller._id });
  });

  await t.test('missing IDs return the same not-found response', async () => {
    const response = await request(id('c'));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { success: false, message: 'Notification not found' });
  });

  await t.test('owners can mark read repeatedly without affecting other recipients', async () => {
    writes = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(owned._id);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
      assert.equal(owned.isRead, true);
    }
    assert.equal(foreign.isRead, false);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].query, { _id: owned._id, userId: caller._id });
    assert.deepEqual(writes[0].update, { $set: { isRead: true } });
  });

  await t.test('malformed IDs fail before database IO', async () => {
    writes = [];
    assert.equal((await request('invalid-id')).status, 400);
    assert.deepEqual(writes, []);
  });
});
