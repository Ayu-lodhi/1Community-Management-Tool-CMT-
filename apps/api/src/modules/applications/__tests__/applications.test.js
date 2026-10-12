const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const Application = require('../applications.model');
const Team = require('../../teams/teams.model');
const User = require('../../admin/admin.model');
const service = require('../applications.service');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));
const ownedTeam = id('a');
const otherTeam = id('b');
const eventId = id('c');

// Exercise the mounted router, real authentication, Express parsing and Mongoose
// casting. Only database reads/writes are replaced; no external services needed.
test('application listing preserves authorization through the database boundary', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'application-listing-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const user = {
    _id: id('1'), name: 'Fixture lead', email: 'lead@example.test',
    role: ROLES.T3_EXECUTIVE, isActive: true, password: 'fixture-password-hash',
  };
  t.mock.method(User, 'findById', (userId) => ({
    select: async () => String(userId) === String(user._id) ? user : null,
  }));
  let teams = [{ _id: ownedTeam }];
  const teamQueries = [];
  t.mock.method(Team.collection, 'find', (query) => {
    teamQueries.push(query);
    return { toArray: async () => teams };
  });
  const applicationQueries = [];
  t.mock.method(Application.collection, 'find', (query, options) => {
    applicationQueries.push(query);
    assert.deepEqual(options.sort, { appliedAt: -1 });
    if (user.role !== ROLES.T1_VOLUNTEER) assert.equal(options.limit, 200);
    return { toArray: async () => [] };
  });
  const app = express();
  app.use('/api/v1/applications', require('../applications.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/applications`;
  const request = (suffix = '', token = tokens.sign(user, 'access', '5m', { isMfaVerified: true })) =>
    fetch(base + suffix, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const scope = () => ({ $and: [{ teamId: { $in: teams.map(team => team._id) } }] });

  await t.test('unfiltered lead listing keeps a non-null team ownership predicate', async () => {
    assert.equal((await request()).status, 200);
    assert.deepEqual(teamQueries.at(-1), { leadId: user._id });
    assert.deepEqual(applicationQueries.at(-1), scope());
  });

  await t.test('filters narrow the lead scope, including a requested foreign team', async () => {
    for (const team of [ownedTeam, otherTeam]) {
      assert.equal((await request(`?teamId=${team.toString().toUpperCase()}&eventId=${eventId}&status=pending`)).status, 200);
      assert.deepEqual(applicationQueries.at(-1), {
        teamId: team, eventId, status: 'pending', ...scope(),
      });
    }
    // The foreign team equality remains ANDed with the distinct owned-team set.
    // Missing/null legacy teamIds cannot satisfy the non-null $in condition.
  });

  await t.test('a lead with no teams always has an empty authorization set', async () => {
    teams = [];
    for (const suffix of ['', `?teamId=${otherTeam}`]) {
      assert.equal((await request(suffix)).status, 200);
      assert.deepEqual(applicationQueries.at(-1).$and, [{ teamId: { $in: [] } }]);
    }
    teams = [{ _id: ownedTeam }];
  });

  await t.test('rejects structured, repeated, empty and malformed filters before database access', async () => {
    const invalidQueries = [
      'teamId[$ne]=000000000000000000000000',
      `teamId[$in][]=${otherTeam}`, `teamId[]=${otherTeam}`,
      `teamId=${ownedTeam}&teamId=${otherTeam}`, 'teamId=', 'teamId=invalid',
      'teamId=00000000000000000000000g',
      'eventId[$ne]=000000000000000000000000', `eventId[]=${eventId}`,
      `eventId=${eventId}&eventId=${eventId}`, 'eventId=', 'eventId=invalid',
      'status[$ne]=pending', 'status[]=pending', 'status=pending&status=approved',
      'status=', 'status=unknown',
    ];
    const applicationCalls = applicationQueries.length;
    const teamCalls = teamQueries.length;
    for (const query of invalidQueries) {
      const response = await request(`?${query}`);
      assert.equal(response.status, 400, query);
      assert.equal((await response.json()).success, false);
    }
    assert.equal(applicationQueries.length, applicationCalls);
    assert.equal(teamQueries.length, teamCalls);
  });

  await t.test('both admin roles retain global listing and validated filters', async () => {
    const teamCalls = teamQueries.length;
    for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      user.role = role;
      assert.equal((await request()).status, 200);
      assert.deepEqual(applicationQueries.at(-1), {});
      for (const status of ['pending', 'approved', 'rejected', 'waitlisted']) {
        assert.equal((await request(`?teamId=${otherTeam}&eventId=${eventId}&status=${status}`)).status, 200);
        assert.deepEqual(applicationQueries.at(-1), { teamId: otherTeam, eventId, status });
      }
      const applicationCalls = applicationQueries.length;
      assert.equal((await request('?teamId[$ne]=000000000000000000000000')).status, 400);
      assert.equal(applicationQueries.length, applicationCalls);
    }
    assert.equal(teamQueries.length, teamCalls);
  });

  await t.test('authentication and role gates still protect the listing; self-listing stays scoped', async () => {
    const applicationCalls = applicationQueries.length;
    assert.equal((await request('', null)).status, 401);
    assert.equal((await request('', tokens.sign(user, 'refresh', '5m'))).status, 401);
    for (const role of [ROLES.T1_VOLUNTEER, ROLES.T2_ASSOCIATE]) {
      user.role = role;
      assert.equal((await request()).status, 403);
    }
    assert.equal(applicationQueries.length, applicationCalls);
    user.role = ROLES.T1_VOLUNTEER;
    assert.equal((await request('/me')).status, 200);
    assert.deepEqual(applicationQueries.at(-1), { studentId: user._id });
  });
});

test('creation persists team ownership and new applications require it', async (t) => {
  const user = { sub: id('2').toString(), name: 'Fixture student', email: 'student@example.test' };
  t.mock.method(Team, 'findById', async () => ({ _id: ownedTeam, name: 'Fixture team', eventId }));
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(Application.collection, 'findOne', async () => null);
  let inserted;
  t.mock.method(Application.collection, 'insertOne', async (document) => {
    inserted = document;
    return { acknowledged: true, insertedId: document._id };
  });
  const result = await service.create({ teamId: ownedTeam.toString() }, user);
  assert.deepEqual(inserted.teamId, ownedTeam);
  assert.deepEqual(result.teamId, ownedTeam);
  assert.deepEqual(inserted.eventId, eventId);
  assert.equal(require('../application.model'), Application);
  const missingOwnership = new Application({
    studentId: user.sub, studentName: user.name, studentEmail: user.email,
  });
  await assert.rejects(missingOwnership.validate(), error => error.errors.teamId.kind === 'required');
});
