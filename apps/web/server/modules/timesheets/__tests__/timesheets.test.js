const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const Timesheet = require('../timesheets.model');
const Team = require('../../teams/teams.model');
const User = require('../../admin/admin.model');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));

test('team timesheet export authorization through the HTTP route', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'timesheet-export-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const requester = {
    _id: id('1'), name: 'Lead', email: 'lead@example.test', role: ROLES.T3_EXECUTIVE,
    isActive: true, password: 'fixture-hash', mustChangePassword: false,
  };
  const team = { _id: id('a'), name: 'Team', leadId: id('2'), members: [requester._id] };
  const entry = {
    _id: id('b'), teamId: team._id, userId: id('3'), date: '2026-10-01',
    userName: 'Worker', userEmail: 'worker@example.test', userRole: ROLES.T1_VOLUNTEER,
    startTime: '09:00', endTime: '17:00', breakMinutes: 30, totalHours: 7.5,
    taskDescription: 'Prepare event materials', status: 'approved',
  };
  let reads = [];
  // Exercise real authentication, controller, service and Mongoose casting;
  // replace only database IO with synthetic fixtures.
  t.mock.method(User.collection, 'findOne', async (query) => requester._id.equals(query._id) ? requester : null);
  t.mock.method(Team.collection, 'findOne', async (query) => {
    assert.ok(query._id instanceof mongoose.Types.ObjectId, 'team lookup must use a scalar ID');
    return team._id.equals(query._id) ? team : null;
  });
  t.mock.method(Timesheet.collection, 'find', (query, options) => {
    reads.push({ query, options });
    return { toArray: async () => [entry] };
  });

  const app = express();
  app.use('/api/v1/timesheets', require('../timesheets.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/timesheets/team/export`;
  const request = (params = {}, noToken = false) => fetch(`${base}?${new URLSearchParams(Object.entries({ teamId: String(team._id), ...params }).filter(([, value]) => value !== undefined))}`, {
    headers: noToken ? {} : { Authorization: `Bearer ${tokens.sign(requester, 'access', '5m', { isMfaVerified: true })}` },
  });
  const denied = async (status, params, noToken) => {
    reads = [];
    const response = await request(params, noToken);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.data, undefined);
    assert.deepEqual(reads, [], 'denied exports must not query timesheets');
  };

  await t.test('unrelated T3 and ordinary team members cannot export or spoof requester fields', async () => {
    await denied(403, { role: ROLES.ADMIN, sub: String(team.leadId), 'requester[role]': ROLES.ADMIN });
    team.members = [];
    await denied(403);
  });

  await t.test('leadless and nonexistent teams fail before reading timesheets', async () => {
    team.leadId = null;
    await denied(403);
    await denied(400, { teamId: String(id('f')) });
  });

  await t.test('missing or malformed team identifiers cannot broaden the export', async () => {
    for (const params of [{ teamId: '' }, { teamId: 'invalid' }, { teamId: undefined, 'teamId[$ne]': '' }, { teamId: undefined, 'teamId[$in][]': String(team._id) }]) {
      await denied(400, params);
    }
    const service = require('../timesheets.service');
    await assert.rejects(service.exportTeamCSV({ $in: [team._id, id('f')] }, undefined, undefined,
      { sub: String(requester._id), role: ROLES.ADMIN }), { statusCode: 400 });
  });

  await t.test('service calls without an authenticated requester fail closed', async () => {
    reads = [];
    const service = require('../timesheets.service');
    for (const requester of [undefined, {}, { role: ROLES.ADMIN }]) {
      await assert.rejects(service.exportTeamCSV(String(team._id), undefined, undefined, requester), { statusCode: 403 });
    }
    assert.deepEqual(reads, []);
  });

  await t.test('lead and both administrator roles retain CSV fields, filters and sorting', async () => {
    for (const role of [ROLES.T3_EXECUTIVE, ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      requester.role = role;
      team.leadId = role === ROLES.T3_EXECUTIVE ? requester._id : id('2');
      for (const params of [{}, { from: '2026-10-01', to: '2026-10-02' }]) {
        reads = [];
        const response = await request(params);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(body, { success: true, data: {
          count: 1,
          csv: 'Date,Name,Email,Role,Start,End,Break (min),Total Hours,Task,Status\n2026-10-01,"Worker",worker@example.test,T1_VOLUNTEER,09:00,17:00,30,7.5,"Prepare event materials",approved',
        } });
        assert.equal(reads.length, 1);
        assert.deepEqual(reads[0].query, { teamId: team._id, ...(params.from ? { date: { $gte: params.from, $lte: params.to } } : {}) });
        assert.deepEqual(reads[0].options.sort, { date: 1 });
      }
    }
  });

  await t.test('authentication and route role restrictions still apply', async () => {
    await denied(401, {}, true);
    for (const role of [ROLES.T1_VOLUNTEER, ROLES.T2_ASSOCIATE]) {
      requester.role = role;
      team.leadId = requester._id;
      await denied(403);
    }
  });
});

test('team timesheet listing binds reads to the authorized team', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'timesheet-list-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const requester = {
    _id: id('1'), name: 'Lead', email: 'lead@example.test', role: ROLES.T3_EXECUTIVE,
    isActive: true, password: 'fixture-hash', mustChangePassword: false,
  };
  const owned = { _id: id('a'), leadId: requester._id };
  const foreign = { _id: id('b'), leadId: id('2') };
  const entries = [
    { _id: id('c'), teamId: owned._id, userName: 'Owned worker', date: '2026-10-01' },
    { _id: id('d'), teamId: foreign._id, userName: 'Foreign worker', date: '2026-10-01' },
    { _id: id('e'), teamId: owned._id, userName: 'Owned worker', date: '2026-10-02' },
  ];
  let teamReads = [];
  let reads = [];
  const matches = (value, filter) => filter?.$in
    ? filter.$in.some(candidate => value.equals(candidate))
    : value.equals(filter);
  // Keep Express parsing, authentication and Mongoose casting real. Simulate only
  // collection IO, including the selector that previously exposed foreign rows.
  t.mock.method(User.collection, 'findOne', async query => requester._id.equals(query._id) ? requester : null);
  t.mock.method(Team.collection, 'findOne', async query => {
    teamReads.push(query);
    return [owned, foreign].find(team => matches(team._id, query._id)) || null;
  });
  t.mock.method(Timesheet.collection, 'find', (query, options) => {
    reads.push({ query, options });
    return { toArray: async () => entries.filter(entry => matches(entry.teamId, query.teamId) && (!query.date || entry.date === query.date)) };
  });
  const app = express();
  app.use(require('../../../middleware/security.middleware'));
  app.use('/api/v1/timesheets', require('../timesheets.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/timesheets/team`;
  const request = (query, authenticated = true) => fetch(`${base}?${query}`, {
    headers: authenticated ? { Authorization: `Bearer ${tokens.sign(requester, 'access', '5m', { isMfaVerified: true })}` } : {},
  });
  const denied = async (query, status = 400, authenticated = true) => {
    reads = [];
    teamReads = [];
    const response = await request(query, authenticated);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.data, undefined);
    assert.deepEqual(reads, [], 'denied requests must not read timesheets');
  };

  await t.test('rejects operator objects, arrays, repeated keys and malformed IDs before team lookup', async () => {
    for (const query of [
      `teamId[$in][]=${owned._id}&teamId[$in][]=${foreign._id}`,
      'teamId[$ne]=',
      `teamId[]=${owned._id}`,
      `teamId=${owned._id}&teamId=${foreign._id}`,
      '', 'teamId=', 'teamId=invalid', 'teamId=abcdefghijklmnopqrstuvwx',
    ]) {
      await denied(query);
      assert.deepEqual(teamReads, []);
    }
    const service = require('../timesheets.service');
    for (const teamId of [null, undefined, 123, {}, { $in: [owned._id, foreign._id] }, [String(owned._id)]]) {
      await assert.rejects(service.getTeamTimesheets(String(requester._id), teamId), { statusCode: 400 });
    }
    assert.deepEqual(teamReads, []);
    assert.deepEqual(reads, []);
  });

  await t.test('foreign, nonexistent and leadless teams fail without reading timesheets', async () => {
    await denied(`teamId=${foreign._id}`);
    await denied(`teamId=${id('f')}`);
    owned.leadId = null;
    await denied(`teamId=${owned._id}`);
    owned.leadId = requester._id;
  });

  await t.test('valid IDs return only the led team and preserve date, sort and limit', async () => {
    for (const date of [undefined, '2026-10-01']) {
      reads = [];
      const response = await request(new URLSearchParams({
        teamId: String(owned._id).toUpperCase(), ...(date ? { date } : {}),
      }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.deepEqual(body.data.map(entry => entry._id), entries.filter(entry => entry.teamId.equals(owned._id) && (!date || entry.date === date)).map(entry => String(entry._id)));
      assert.equal(reads.length, 1);
      assert.deepEqual(reads[0].query, { teamId: owned._id, ...(date ? { date } : {}) });
      assert.deepEqual(reads[0].options.sort, { date: -1, userName: 1 });
      assert.equal(reads[0].options.limit, 200);
    }
  });

  await t.test('authentication, role and leadership checks remain enforced', async () => {
    await denied(`teamId=${owned._id}`, 401, false);
    for (const role of [ROLES.T1_VOLUNTEER, ROLES.T2_ASSOCIATE]) {
      requester.role = role;
      await denied(`teamId=${owned._id}`, 403);
    }
    for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      requester.role = role;
      await denied(`teamId=${foreign._id}`);
    }
  });
});
