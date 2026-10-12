const assert = require('node:assert/strict');
const { test } = require('node:test');
const { format } = require('node:util');
const mongoose = require('mongoose');
const User = require('../../admin/admin.model');
const Team = require('../../teams/teams.model');
const Announcement = require('../../announcements/announcements.model');
const Notification = require('../notifications.model');
const socket = require('../../../config/socket');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));

test('announcement delivery logs cannot include recipient or content input', async (t) => {
  const authorId = id('1');
  const recipientId = id('2');
  const teamId = id('3');
  const recipient = {
    _id: recipientId,
    email: 'recipient@example.test',
    phone: '+15555550123',
    notificationPrefs: { inApp: true, email: true, sms: true },
  };
  const logs = [];
  const notifications = [];
  const emissions = [];
  t.mock.method(console, 'log', (...args) => logs.push(format(...args)));
  t.mock.method(socket, 'emitToUser', (...args) => emissions.push(args));
  t.mock.method(User.collection, 'findOne', async () => recipient);
  t.mock.method(Team.collection, 'findOne', async () => ({
    _id: teamId, name: 'Synthetic team', members: [authorId, recipientId],
  }));
  // Keep service controls and schema validation real; replace only database IO.
  t.mock.method(Announcement.collection, 'insertOne', async doc => ({ insertedId: doc._id }));
  t.mock.method(Notification.collection, 'insertOne', async doc => {
    notifications.push(doc);
    return { insertedId: doc._id };
  });
  const announcements = require('../../announcements/announcements.service');
  const { notify } = require('../notifications.service');

  for (const [name, payload] of [
    ['ordinary text', 'Team meeting'],
    ['forged records and control characters', 'Hello\r\n[EMAIL QUEUED] forged\n[SMS QUEUED] forged\t\x00\x1b[2J\x85\u2028\u2029"\\'],
  ]) {
    await t.test(name, async () => {
      logs.length = 0;
      notifications.length = 0;
      emissions.length = 0;
      recipient.email = `recipient@example.test${payload}`;
      recipient.phone = `+15555550123${payload}`;
      const announcement = await announcements.create({
        title: payload, message: payload, target: 'TEAM', targetTeamId: teamId.toString(),
      }, { sub: authorId.toString(), name: 'Author', role: 'T2_ASSOCIATE' });

      assert.equal(announcement.recipientCount, 1);
      assert.deepEqual(logs, ['[EMAIL QUEUED]', '[SMS QUEUED]']);
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].title, `Announcement: ${payload}`);
      assert.equal(notifications[0].message, payload);
      assert.equal(emissions.length, 1);
      assert.equal(emissions[0][2].title, `Announcement: ${payload}`);
      assert.equal(emissions[0][2].message, payload);
    });
  }

  for (const [name, prefs, expected] of [
    ['email only', { inApp: false, email: true, sms: false }, ['[EMAIL QUEUED]']],
    ['SMS only', { inApp: false, email: false, sms: true }, ['[SMS QUEUED]']],
    ['channels disabled', { inApp: false, email: false, sms: false }, []],
    ['category disabled', { categories: { announcement: false } }, []],
  ]) {
    await t.test(name, async () => {
      logs.length = 0;
      recipient.notificationPrefs = prefs;
      await notify(recipientId, 'announcement', 'Title', 'Message');
      assert.deepEqual(logs, expected);
    });
  }
});
