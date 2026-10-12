const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const ChatRoom = require('../chatRoom.model');
const Message = require('../chat.model');
const Team = require('../../teams/teams.model');
const User = require('../../admin/admin.model');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');
const service = require('../chat.service');
const tokens = require('../../auth/auth.tokens');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));
const equal = (left, right) => String(left) === String(right);
const matches = (document, query) => Object.entries(query).every(([key, value]) => {
  const values = Array.isArray(document[key]) ? document[key] : [document[key]];
  const expected = value?.$in || [value];
  return values.some((actual) => expected.some((item) => equal(actual, item)));
});

test('team chat authorization through HTTP and socket access checks', async (t) => {
  const account = (digit, role) => ({
    _id: id(digit), name: `User ${digit}`, role, isActive: true,
    password: 'synthetic-hash', mustChangePassword: false,
    notificationPrefs: { inApp: false, email: false, sms: false },
  });
  const attacker = account('1', ROLES.T3_EXECUTIVE);
  const lead = account('2', ROLES.T3_EXECUTIVE);
  const member = account('3', ROLES.T1_VOLUNTEER);
  const admin = account('4', ROLES.ADMIN);
  const superAdmin = account('5', ROLES.SUPER_ADMIN);
  const users = [attacker, lead, member, admin, superAdmin];
  const team = { _id: id('a'), name: 'Private team', leadId: lead._id, members: [member._id] };
  const rooms = [];
  const messages = [];
  const writes = [];
  // Exercise real routing, authentication, casting and population; replace database IO only.
  for (const [Model, documents] of [[User, users], [Team, [team]], [ChatRoom, rooms], [Message, messages]]) {
    t.mock.method(Model.collection, 'findOne', async (query) => documents.find((doc) => matches(doc, query)) || null);
    t.mock.method(Model.collection, 'find', (query) => ({
      toArray: async () => documents.filter((doc) => matches(doc, query)),
    }));
    t.mock.method(Model.collection, 'insertOne', async (doc) => {
      writes.push({ model: Model.modelName, operation: 'insert', doc });
      documents.push(doc);
      return { acknowledged: true, insertedId: doc._id };
    });
    t.mock.method(Model.collection, 'findOneAndUpdate', async (query, update, options) => {
      assert.equal(options.returnDocument, 'after');
      const doc = documents.find((item) => matches(item, query));
      if (!doc) return null;
      writes.push({ model: Model.modelName, operation: 'update', update });
      Object.assign(doc, update.$set);
      return doc;
    });
    t.mock.method(Model.collection, 'updateOne', async (query, update) => {
      const doc = documents.find((item) => matches(item, query));
      if (!doc) return { matchedCount: 0 };
      writes.push({ model: Model.modelName, operation: 'update', update });
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    });
    t.mock.method(Model.collection, 'deleteMany', async (query) => {
      writes.push({ model: Model.modelName, operation: 'deleteMany' });
      for (let i = documents.length - 1; i >= 0; i--) {
        if (matches(documents[i], query)) documents.splice(i, 1);
      }
      return { acknowledged: true };
    });
    t.mock.method(Model.collection, 'findOneAndDelete', async (query) => {
      writes.push({ model: Model.modelName, operation: 'delete' });
      const index = documents.findIndex((doc) => matches(doc, query));
      return index < 0 ? null : documents.splice(index, 1)[0];
    });
  }
  const app = express();
  app.use(express.json());
  app.use('/api/v1/chat', require('../chat.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const request = async (user, method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/chat${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? {
        Authorization: `Bearer ${tokens.sign(user, 'access', '5m', { isMfaVerified: true })}`,
      } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const initialize = (user) => request(user, 'POST', `/rooms/team/${team._id}`);

  await t.test('authentication and role gates still protect creation', async () => {
    assert.equal((await request(null, 'POST', '/rooms', { name: 'Room' })).status, 401);
    assert.equal((await request(member, 'POST', '/rooms', { name: 'Room' })).status, 403);
    assert.deepEqual(writes, []);
  });

  await t.test('generic creation rejects team bindings before any write, even for admins', async () => {
    for (const user of [attacker, lead, admin, superAdmin]) {
      for (const teamId of [String(team._id), { $ne: null }, [String(team._id)]]) {
        const result = await request(user, 'POST', '/rooms', { name: 'Poisoned', teamId });
        assert.equal(result.status, 400);
        assert.match(result.body.message, /team chat endpoint/);
      }
    }
    assert.deepEqual(writes, []);
  });

  await t.test('another executive cannot initialize a foreign team room', async () => {
    assert.equal((await initialize(attacker)).status, 400);
    assert.deepEqual(writes, []);
  });

  await t.test('ordinary rooms retain creation, messaging and creator deletion', async () => {
    const result = await request(attacker, 'POST', '/rooms', { name: 'Ordinary', teamId: null });
    assert.equal(result.status, 201);
    assert.equal(result.body.data.teamId, null);
    const path = `/rooms/${result.body.data._id}`;
    assert.equal((await request(attacker, 'POST', `${path}/messages`, { text: 'Hello' })).status, 201);
    assert.equal((await request(attacker, 'GET', `${path}/messages`)).body.data.length, 1);
    assert.equal((await request(attacker, 'DELETE', path)).status, 200);
    assert.equal(rooms.length, 0);
    assert.equal(messages.length, 0);
  });

  const poisoned = {
    _id: id('b'), name: 'Legacy poisoned room', teamId: team._id,
    createdBy: attacker._id, members: [attacker._id, lead._id, member._id],
    memberCount: 3, isArchived: false,
  };
  rooms.push(poisoned);
  messages.push({ _id: id('c'), roomId: poisoned._id, senderId: member._id, text: 'Private' });

  await t.test('legacy membership and creator status grant no foreign team access', async () => {
    writes.length = 0;
    const path = `/rooms/${poisoned._id}`;
    for (const [method, suffix, body] of [
      ['GET', ''], ['GET', '/messages'], ['POST', '/messages', { text: 'Attack' }],
      ['POST', '/members', { userId: String(attacker._id) }], ['PATCH', '/archive'], ['DELETE', ''],
    ]) {
      assert.equal((await request(attacker, method, path + suffix, body)).status, 400);
    }
    assert.deepEqual((await request(attacker, 'GET', '/rooms')).body.data, []);
    assert.equal(await service.canAccessRoom(String(poisoned._id), String(attacker._id)), false);
    assert.deepEqual(writes, []);
    assert.equal(messages.length, 1);
  });

  await t.test('legitimate team members retain HTTP and socket read access', async () => {
    assert.equal((await request(member, 'GET', `/rooms/${poisoned._id}/messages`)).body.data[0].text, 'Private');
    assert.equal(await service.canAccessRoom(String(poisoned._id), String(member._id)), true);
  });

  await t.test('initialization replaces poisoned ownership and membership without losing history', async () => {
    const result = await initialize(lead);
    assert.equal(result.status, 201);
    assert.equal(result.body.data._id, String(poisoned._id));
    assert.equal(result.body.data.createdBy._id, String(lead._id));
    assert.deepEqual(result.body.data.members.map((user) => user._id).sort(), [String(lead._id), String(member._id)].sort());
    assert.equal(result.body.data.memberCount, 2);
    assert.equal(messages.length, 1);
    assert.equal((await request(attacker, 'DELETE', `/rooms/${poisoned._id}`)).status, 400);
    assert.equal((await initialize(lead)).body.data._id, String(poisoned._id));
    assert.equal(rooms.length, 1);
  });

  await t.test('lead cannot reintroduce foreign membership through the manual add endpoint', async () => {
    writes.length = 0;
    assert.equal((await request(lead, 'POST', `/rooms/${poisoned._id}/members`, { userId: String(attacker._id) })).status, 400);
    assert.deepEqual(writes, []);
  });

  await t.test('removed team members lose access even while stored in the room', async () => {
    team.members = [];
    assert.equal((await request(member, 'GET', `/rooms/${poisoned._id}/messages`)).status, 400);
    assert.equal(await service.canAccessRoom(String(poisoned._id), String(member._id)), false);
    team.members = [member._id];
  });

  await t.test('lead and admins can manage a team room regardless of legacy creator', async () => {
    assert.equal((await request(lead, 'PATCH', `/rooms/${poisoned._id}/archive`)).status, 200);
    for (const user of [admin, superAdmin]) {
      assert.equal((await initialize(user)).status, 201);
      assert.equal(await service.canAccessRoom(String(poisoned._id), String(user._id)), true);
    }
    assert.equal((await request(admin, 'DELETE', `/rooms/${poisoned._id}`)).status, 200);
    assert.equal(rooms.length, 0);
    assert.equal(messages.length, 0);
  });

  await t.test('authorized team creation uses stored team metadata and roster', async () => {
    const result = await initialize(lead);
    assert.equal(result.status, 201);
    assert.equal(result.body.data.teamId, String(team._id));
    assert.equal(result.body.data.teamName, team.name);
    assert.equal(result.body.data.createdBy._id, String(lead._id));
    assert.deepEqual(result.body.data.members.map((user) => user._id).sort(), [String(lead._id), String(member._id)].sort());
  });

  await t.test('orphaned team rooms fail closed', async () => {
    rooms[0].teamId = id('f');
    const path = `/rooms/${rooms[0]._id}`;
    assert.equal((await request(lead, 'GET', `${path}/messages`)).status, 400);
    assert.equal((await request(lead, 'DELETE', path)).status, 400);
    assert.equal(await service.canAccessRoom(String(rooms[0]._id), String(lead._id)), false);
  });
});
