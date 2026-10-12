const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const Team = require('../teams.model');
const Event = require('../../events/events.model');
const User = require('../../admin/admin.model');
const Notification = require('../../notifications/notifications.model');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));

test('team membership authorization through the HTTP routes', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'teams-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const requester = {
    _id: id('1'), name: 'Lead', email: 'lead@example.test', role: ROLES.T3_EXECUTIVE,
    isActive: true, password: 'fixture-hash', mustChangePassword: false,
  };
  const target = {
    _id: id('a'), name: 'Member', email: 'member@example.test', role: ROLES.T1_VOLUNTEER,
    teamId: id('b'), notificationPrefs: { email: false, sms: false, inApp: true },
  };
  const otherLead = { _id: id('2'), name: 'Other lead', role: ROLES.T3_EXECUTIVE };
  const users = [requester, target, otherLead];
  let team;
  let event;
  let otherTeams;
  let writes;
  const reset = () => {
    requester.role = ROLES.T3_EXECUTIVE;
    target.role = ROLES.T1_VOLUNTEER;
    team = { _id: id('c'), name: 'Team', leadId: requester._id, eventId: id('d'), members: [requester._id], memberCount: 1 };
    event = { _id: id('d'), title: 'Event', date: '2026-10-01', location: 'Fixture', headId: otherLead._id, members: [otherLead._id], memberCount: 1 };
    otherTeams = [];
    writes = [];
  };
  const includeTarget = () => {
    team.members.push(target._id);
    team.memberCount++;
    event.members.push(target._id);
    event.memberCount++;
  };
  reset();

  // Keep authentication, controllers, service, casting and save validation real.
  // Stub collection IO only and record every write, including notifications.
  t.mock.method(User.collection, 'findOne', async (query) => users.find(u => u._id.equals(query._id)) || null);
  t.mock.method(User.collection, 'find', (query) => ({
    toArray: async () => users.filter(u => query._id.$in.some(value => u._id.equals(value))),
  }));
  t.mock.method(Team.collection, 'findOne', async (query) =>
    team._id.equals(query._id) ? { ...team, members: [...team.members] } : null);
  t.mock.method(Team.collection, 'find', (query) => ({
    toArray: async () => {
      assert.equal(String(query.eventId), String(team.eventId));
      assert.equal(String(query._id.$ne), String(team._id));
      assert.equal(String(query.members), String(target._id));
      return otherTeams;
    },
  }));
  t.mock.method(Event.collection, 'findOne', async () => event ? { ...event, members: [...event.members] } : null);
  for (const [kind, model] of [['team', Team], ['event', Event]]) {
    t.mock.method(model.collection, 'updateOne', async (query, update) => {
      writes.push({ kind, query, update });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  }
  t.mock.method(User.collection, 'findOneAndUpdate', async (query, update) => {
    writes.push({ kind: 'user', query, update });
    return target;
  });
  t.mock.method(Notification.collection, 'insertOne', async (doc) => {
    writes.push({ kind: 'notification', doc });
    return { acknowledged: true, insertedId: doc._id };
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1/teams', require('../teams.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/teams`;
  const request = (method, options = {}) => {
    const userId = options.userId || String(target._id);
    const token = options.noToken ? null : tokens.sign(requester, 'access', '5m', { isMfaVerified: true });
    return fetch(`${base}/${options.teamId || team._id}/members${method === 'DELETE' ? `/${userId}` : ''}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ userId, ...options.body }) } : {}),
    });
  };
  const rejected = async (method, status, message, options) => {
    const response = await request(method, options);
    assert.equal(response.status, status);
    if (message) assert.equal((await response.json()).message, message);
    assert.deepEqual(writes, [], 'denied requests must not write teams, users, events or notifications');
  };

  await t.test('unrelated T3 cannot add or remove even with forged requester fields', async () => {
    for (const method of ['POST', 'DELETE']) {
      reset();
      if (method === 'DELETE') includeTarget();
      team.leadId = otherLead._id;
      await rejected(method, 403, 'Only the team lead or admin can manage members', {
        body: { role: ROLES.ADMIN, sub: String(otherLead._id), requester: { role: ROLES.ADMIN } },
      });
    }
  });

  await t.test('ordinary membership and leadless teams do not grant management', async () => {
    for (const leadId of [otherLead._id, null]) {
      for (const method of ['POST', 'DELETE']) {
        reset();
        team.leadId = leadId;
        await rejected(method, 403, 'Only the team lead or admin can manage members');
      }
    }
  });

  await t.test('service calls without an authenticated requester fail closed', async () => {
    reset();
    const service = require('../teams.service');
    for (const method of ['addMember', 'removeMember']) {
      await assert.rejects(service[method](String(team._id), String(target._id)), { statusCode: 403 });
    }
    assert.deepEqual(writes, []);
  });

  await t.test('lead and both administrator roles can add with canonical IDs and event cascade', async () => {
    for (const role of [ROLES.T3_EXECUTIVE, ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      reset();
      requester.role = role;
      if (role !== ROLES.T3_EXECUTIVE) team.leadId = otherLead._id;
      assert.equal((await request('POST', { userId: String(target._id).toUpperCase() })).status, 200);
      assert.deepEqual(writes.map(w => w.kind), ['team', 'user', 'event', 'notification']);
      assert.equal(writes[0].update.$set.memberCount, 2);
      assert.equal(String(writes[1].update.$set.teamId), String(team._id));
      assert.equal(writes[2].update.$set.memberCount, 2);
    }
  });

  await t.test('lead and administrators can remove ordinary members and cascade', async () => {
    for (const role of [ROLES.T3_EXECUTIVE, ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      reset();
      includeTarget();
      requester.role = role;
      if (role !== ROLES.T3_EXECUTIVE) team.leadId = otherLead._id;
      assert.equal((await request('DELETE', { userId: String(target._id).toUpperCase() })).status, 200);
      assert.deepEqual(writes.map(w => w.kind), ['team', 'event', 'notification']);
      assert.deepEqual(writes[0].update.$set.members.map(String), [String(requester._id)]);
      assert.deepEqual(writes[1].update.$set.members.map(String), [String(otherLead._id)]);
    }
  });

  await t.test('nonmembers cannot be removed through a team to alter its event', async () => {
    reset();
    event.members.push(target._id);
    await rejected('DELETE', 400, 'User is not a member of this team');
  });

  await t.test('event heads are protected before writes for leads and administrators', async () => {
    for (const role of [ROLES.T3_EXECUTIVE, ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      reset();
      includeTarget();
      requester.role = role;
      event.headId = target._id;
      await rejected('DELETE', 400, 'Cannot remove the Event Head', { userId: String(target._id).toUpperCase() });
    }
  });

  await t.test('team lead cannot be removed', async () => {
    reset();
    includeTarget();
    requester.role = ROLES.ADMIN;
    team.leadId = target._id;
    await rejected('DELETE', 400, 'Cannot remove the Team Lead');
  });

  await t.test('other event teams retain event membership, including its head', async () => {
    reset();
    includeTarget();
    event.headId = target._id;
    otherTeams = [{ _id: id('e'), name: 'Other team', members: [target._id] }];
    assert.equal((await request('DELETE')).status, 200);
    assert.deepEqual(writes.map(w => w.kind), ['team', 'notification']);
    assert.equal(writes[1].doc.title, 'Removed from Team');
  });

  await t.test('team cascade preserves the direct event restriction on adding T3', async () => {
    reset();
    target.role = ROLES.T3_EXECUTIVE;
    await rejected('POST', 403, 'Only Admin can add T3. You can add T2 or T1.');
    requester.role = ROLES.ADMIN;
    assert.equal((await request('POST')).status, 200);
    assert.deepEqual(writes.map(w => w.kind), ['team', 'user', 'event', 'notification']);
  });

  await t.test('existing event membership is not duplicated on addition', async () => {
    reset();
    target.role = ROLES.T3_EXECUTIVE;
    event.members.push(target._id);
    assert.equal((await request('POST')).status, 200);
    assert.deepEqual(writes.map(w => w.kind), ['team', 'user', 'notification']);
  });

  await t.test('duplicate membership is rejected even with uppercase identifiers', async () => {
    reset();
    includeTarget();
    await rejected('POST', 400, 'Member is already in this team', { userId: String(target._id).toUpperCase() });
  });

  await t.test('teams without events still support authorized membership changes', async () => {
    for (const method of ['POST', 'DELETE']) {
      reset();
      if (method === 'DELETE') includeTarget();
      team.eventId = null;
      assert.equal((await request(method)).status, 200);
      assert.equal(writes.some(w => w.kind === 'event'), false);
      assert.equal(writes[0].kind, 'team');
    }
  });

  await t.test('authentication, route role gates and team existence remain enforced', async () => {
    for (const method of ['POST', 'DELETE']) {
      reset();
      await rejected(method, 401, null, { noToken: true });
      requester.role = ROLES.T1_VOLUNTEER;
      await rejected(method, 403);
      requester.role = ROLES.T3_EXECUTIVE;
      await rejected(method, 400, 'Team not found', { teamId: String(id('f')) });
    }
  });
});

const metadataKeys = ['_id', 'name', 'eventId', 'eventTitle', 'description', 'memberCount', 'chatActive', 'createdAt'];

test('team reads protect contact rosters', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'teams-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const requester = {
    _id: id('1'), name: 'Requester', email: 'requester@example.test',
    role: ROLES.T1_VOLUNTEER, isActive: true, password: 'fixture-hash', mustChangePassword: false,
  };
  const lead = { ...requester, _id: id('2'), name: 'Lead', email: 'lead@example.test' };
  const member = { ...requester, _id: id('3'), name: 'Member', email: 'member@example.test' };
  const users = [requester, lead, member];
  const team = {
    _id: id('a'), name: 'Discoverable team', eventId: id('c'), eventTitle: 'Event',
    description: 'Team description', leadId: lead._id, leadName: lead.name,
    members: [member._id], memberCount: 1, chatActive: true,
    chatRoomId: 'private-team-room', createdAt: new Date('2026-10-01T00:00:00Z'),
  };
  const ownTeam = { ...team, _id: id('b'), name: 'Own team', members: [requester._id] };
  const teams = [team, ownTeam];
  const contactQueries = [];
  const project = (doc, projection) => {
    if (!projection || !Object.values(projection).some(value => value === 1)) return { ...doc };
    return Object.fromEntries(Object.entries(doc).filter(([key]) => key === '_id' || projection[key] === 1));
  };
  t.mock.method(User.collection, 'findOne', async (query) =>
    users.find(user => user._id.equals(query._id)) || null);
  t.mock.method(User.collection, 'find', (query, options) => {
    contactQueries.push(query);
    return { toArray: async () => users.filter(user =>
      query._id.$in.some(userId => user._id.equals(userId)) &&
      (query.isActive === undefined || user.isActive === query.isActive)
    ).map(user => project(user, options.projection)) };
  });
  t.mock.method(Team.collection, 'findOne', async (query, options) => {
    const found = teams.find(item => item._id.equals(query._id));
    return found ? project(found, options.projection) : null;
  });
  t.mock.method(Team.collection, 'find', (query, options) => ({
    toArray: async () => teams.filter(item => !query.$or || query.$or.some(condition =>
      condition.leadId ? item.leadId?.equals(condition.leadId) :
        item.members.some(memberId => memberId.equals(condition.members))
    )).map(item => project(item, options.projection)),
  }));

  const app = express();
  app.use('/api/v1/teams', require('../teams.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/v1/teams`;
  const request = async (path = '', token = tokens.sign(requester, 'access', '5m', { isMfaVerified: true })) => {
    const response = await fetch(`${url}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };
  const assertMetadata = (data) => {
    assert.deepEqual(Object.keys(data).sort(), [...metadataKeys].sort());
    assert.equal(data.name, team.name);
    assert.equal(data.eventId, String(team.eventId));
    assert.equal(data.memberCount, 1);
  };
  const assertRoster = (data) => {
    assert.equal(data.leadId.email, lead.email);
    assert.equal(data.members[0].email, member.email);
    assert.deepEqual(Object.keys(data.members[0]).sort(), ['_id', 'email', 'name', 'role']);
  };

  await t.test('outsiders of every ordinary role get metadata from list and detail', async () => {
    for (const role of [ROLES.T1_VOLUNTEER, ROLES.T2_ASSOCIATE, ROLES.T3_EXECUTIVE]) {
      requester.role = role;
      assertMetadata((await request()).body.data.find(item => item._id === String(team._id)));
      contactQueries.length = 0;
      const detail = await request(`/${team._id}`);
      assert.equal(detail.status, 200);
      assertMetadata(detail.body.data);
      assert.equal(contactQueries.length, 0, 'outsider detail must not query contacts');
    }
  });
  await t.test('mixed listing populates only teams the requester belongs to', async () => {
    contactQueries.length = 0;
    const { body } = await request();
    assertMetadata(body.data[0]);
    assert.equal(body.data[1].members[0].email, requester.email);
    assert.ok(contactQueries.length > 0);
    assert.ok(contactQueries.every(query => !query._id.$in.some(value => value.equals(member._id))));
  });
  await t.test('current members and leads get rosters in list and detail', async () => {
    for (const relation of ['member', 'lead']) {
      if (relation === 'member') team.members.push(requester._id);
      else team.leadId = requester._id;
      try {
        for (const path of ['', `/${team._id}`]) {
          const { body } = await request(path);
          const data = path ? body.data : body.data[0];
          assert.equal(data.members[0].email, member.email);
          assert.equal(data.leadId.email, relation === 'lead' ? requester.email : lead.email);
        }
      } finally {
        team.members = [member._id];
        team.leadId = lead._id;
      }
    }
    // Subsequent requests must re-evaluate membership, including the cached lead name.
    assertMetadata((await request(`/${team._id}`)).body.data);
    assertMetadata((await request()).body.data[0]);
  });
  await t.test('both administrator roles retain roster access', async () => {
    for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      requester.role = role;
      assertRoster((await request()).body.data[0]);
      assertRoster((await request(`/${team._id}`)).body.data);
    }
    requester.role = ROLES.T1_VOLUNTEER;
  });
  await t.test('empty teams and missing teams are handled safely', async () => {
    team.leadId = null;
    team.members = [];
    try {
      assertMetadata((await request(`/${team._id}`)).body.data);
    } finally {
      team.leadId = lead._id;
      team.members = [member._id];
    }
    assert.equal((await request(`/${id('f')}`)).status, 404);
    assert.equal((await request('/invalid-id')).status, 404);
  });
  await t.test('existing own-team and member endpoint controls remain enforced', async () => {
    const mine = await request('/me');
    assert.equal(mine.body.data.length, 1);
    assert.equal(mine.body.data[0].members[0].email, requester.email);
    assert.equal((await request(`/${team._id}/members`)).status, 400);
    const ownMembers = await request(`/${ownTeam._id}/members`);
    assert.equal(ownMembers.status, 200);
    assert.equal(ownMembers.body.data[0].email, lead.email);
  });
  await t.test('missing tokens and inactive accounts are rejected', async () => {
    for (const path of ['', `/${team._id}`]) {
      assert.equal((await request(path, null)).status, 401);
      requester.isActive = false;
      try {
        assert.equal((await request(path)).status, 401);
      } finally {
        requester.isActive = true;
      }
    }
  });
});
