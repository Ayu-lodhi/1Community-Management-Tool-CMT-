const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../attendance.model');
const Team = require('../../teams/teams.model');
const User = require('../../admin/admin.model');
const service = require('../attendance.service');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));

// Keep the router, authentication, service and Mongoose casting real; replace
// only collection operations so authorization is tested at the write boundary.
test('manual attendance enforces team membership through the HTTP route', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'attendance-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const marker = {
    _id: id('1'), name: 'Fixture lead', email: 'lead@example.test',
    role: ROLES.T3_EXECUTIVE, isActive: true, password: 'fixture-hash', mustChangePassword: false,
  };
  const member = { _id: id('a'), name: 'Member', email: 'member@example.test' };
  const outsider = { _id: id('b'), name: 'Outsider', email: 'outsider@example.test' };
  const team = { _id: id('c'), name: 'Fixture team', leadId: marker._id, members: [member._id] };
  const users = [marker, member, outsider];
  t.mock.method(User.collection, 'findOne', async (query) =>
    users.find(user => user._id.equals(query._id)) || null);
  t.mock.method(Team.collection, 'findOne', async (query) =>
    team._id.equals(query._id) ? team : null);
  const writes = [];
  let duplicateKey = false;
  t.mock.method(Attendance.collection, 'findOneAndUpdate', async (query, update, options) => {
    writes.push({ query, update, options });
    if (duplicateKey && options.upsert) {
      throw Object.assign(new Error('Duplicate key'), { code: 11000 });
    }
    return { _id: id('d'), ...query, ...update.$set };
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1/attendance', require('../attendance.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/v1/attendance/mark`;
  const request = (studentId, overrides = {}, token = tokens.sign(marker, 'access', '5m', { isMfaVerified: true })) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ studentId, teamId: team._id, date: '2026-10-01', status: 'present', ...overrides }),
    });
  const rejectWithoutWrite = async (studentId, message, overrides = {}) => {
    const before = writes.length;
    const response = await request(studentId, overrides);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, message);
    assert.equal(writes.length, before, 'rejection must prevent both upsert and fallback update');
  };

  await t.test('lead cannot create or overwrite attendance for an unrelated user', async () => {
    await rejectWithoutWrite(outsider._id, 'Student is not a member of this team');
  });

  await t.test('lead can mark members using canonical or uppercase ObjectId strings', async () => {
    for (const studentId of [String(member._id), String(member._id).toUpperCase()]) {
      const before = writes.length;
      const response = await request(studentId, { status: 'absent', notes: 'Fixture note' });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.studentId, String(member._id));
      assert.equal(writes.length, before + 1);
      assert.deepEqual(writes.at(-1).query, { studentId: member._id, teamId: team._id, date: '2026-10-01' });
      assert.equal(writes.at(-1).options.upsert, true);
      assert.equal(writes.at(-1).update.$set.status, 'absent');
      assert.equal(writes.at(-1).update.$set.notes, 'Fixture note');
    }
  });

  await t.test('lead is eligible even when absent from the members array', async () => {
    assert.equal((await request(marker._id)).status, 200);
  });

  await t.test('both administrator roles can mark members and leads but cannot bypass membership', async () => {
    const previousLead = team.leadId;
    team.leadId = outsider._id;
    try {
      for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
        marker.role = role;
        assert.equal((await request(member._id)).status, 200);
        assert.equal((await request(outsider._id)).status, 200);
        await rejectWithoutWrite(marker._id, 'Student is not a member of this team');
      }
    } finally {
      marker.role = ROLES.T3_EXECUTIVE;
      team.leadId = previousLead;
    }
  });

  await t.test('removed members are rejected on subsequent requests', async () => {
    team.members = [];
    try {
      await rejectWithoutWrite(member._id, 'Student is not a member of this team');
    } finally {
      team.members = [member._id];
    }
  });

  await t.test('existing team authority and existence checks remain enforced', async () => {
    team.leadId = outsider._id;
    try {
      await rejectWithoutWrite(member._id, 'Only the team lead or admin can mark attendance');
    } finally {
      team.leadId = marker._id;
    }
    await rejectWithoutWrite(member._id, 'Team not found', { teamId: id('e') });
    await rejectWithoutWrite(id('f'), 'Student not found');
  });

  await t.test('teams with no lead still require membership for administrators', async () => {
    marker.role = ROLES.ADMIN;
    team.leadId = null;
    try {
      assert.equal((await request(member._id)).status, 200);
      await rejectWithoutWrite(outsider._id, 'Student is not a member of this team');
    } finally {
      marker.role = ROLES.T3_EXECUTIVE;
      team.leadId = marker._id;
    }
  });

  await t.test('duplicate-key fallback remains available only for eligible students', async () => {
    duplicateKey = true;
    try {
      const before = writes.length;
      assert.equal((await request(member._id)).status, 200);
      assert.equal(writes.length, before + 2);
      assert.equal(writes.at(-1).options.upsert, undefined);
      await rejectWithoutWrite(outsider._id, 'Student is not a member of this team');
    } finally {
      duplicateKey = false;
    }
  });

  await t.test('authentication and role gates still reject unauthorized markers', async () => {
    const before = writes.length;
    assert.equal((await request(member._id, {}, null)).status, 401);
    marker.role = ROLES.T1_VOLUNTEER;
    try {
      assert.equal((await request(member._id)).status, 403);
    } finally {
      marker.role = ROLES.T3_EXECUTIVE;
    }
    assert.equal(writes.length, before);
  });
});

const teamId = id('a');
const otherTeamId = id('b');
const studentId = id('2');
const date = new Date().toISOString().split('T')[0];
const paths = ['/team', '/team/stats', '/team/history', '/download'];

// Use the real router, authentication, query parsing, Mongoose casting and
// population. Replace only database operations with synthetic fixtures.
test('team attendance reads enforce the current team relationship', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'attendance-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const user = {
    _id: id('1'), role: ROLES.T3_EXECUTIVE, isActive: true,
    name: 'Fixture executive', password: 'synthetic-password-hash', mustChangePassword: false,
  };
  t.mock.method(User, 'findById', (userId) => ({
    select: async () => String(userId) === String(user._id) ? user : null,
  }));
  const team = { _id: teamId, name: 'Fixture team', leadId: user._id, members: [studentId] };
  const otherTeam = { _id: otherTeamId, name: 'Other team', leadId: studentId, members: [studentId] };
  const teamLookup = t.mock.method(Team.collection, 'findOne', async ({ _id }) => {
    if (_id.equals(teamId)) return team;
    if (_id.equals(otherTeamId)) return otherTeam;
    return null;
  });
  const memberLookup = t.mock.method(User.collection, 'find', () => ({
    toArray: async () => [{ _id: studentId, name: 'Fixture student', email: 'student@example.test', role: ROLES.T1_VOLUNTEER }],
  }));
  const attendanceQueries = [];
  t.mock.method(Attendance.collection, 'find', (query) => {
    attendanceQueries.push(query);
    assert.ok(query.teamId instanceof mongoose.Types.ObjectId);
    return { toArray: async () => [{
      _id: id('3'), teamId: query.teamId, teamName: 'Fixture team', studentId,
      studentName: 'Fixture student', studentEmail: 'student@example.test', date,
      status: 'present', notes: 'Private fixture note', method: 'self',
      checkInTime: new Date(`${date}T08:00:00Z`), durationMinutes: 60,
    }] };
  });
  const app = express();
  app.use('/api/v1/attendance', require('../attendance.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/attendance`;
  const request = (path, query = `teamId=${teamId}`, token = tokens.sign(user, 'access', '5m', { isMfaVerified: true })) =>
    fetch(`${base}${path}?${query}&date=${date}&from=${date}&to=${date}&days=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  const denied = async (query, status = 403, token) => {
    const reads = attendanceQueries.length;
    const populations = memberLookup.mock.callCount();
    for (const path of paths) {
      const response = await request(path, query, token);
      assert.equal(response.status, status, path);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.data, undefined);
    }
    assert.equal(attendanceQueries.length, reads, 'no attendance read on denial');
    assert.equal(memberLookup.mock.callCount(), populations, 'no roster population on denial');
  };
  const allowed = async (selectedTeam = teamId) => {
    for (const path of paths) {
      const response = await request(path, `teamId=${String(selectedTeam).toUpperCase()}`);
      assert.equal(response.status, 200, path);
      const { data } = await response.json();
      assert.ok(attendanceQueries.at(-1).teamId.equals(selectedTeam));
      if (path === '/team') {
        assert.equal(data.roster[0].notes, 'Private fixture note');
        assert.equal(data.roster[0].checkInTime, `${date}T08:00:00.000Z`);
        assert.equal(attendanceQueries.at(-1).date, date);
      } else if (path === '/download') {
        assert.equal(data.recordCount, 1);
        assert.match(data.csv, /Private fixture note/);
        assert.deepEqual(attendanceQueries.at(-1).date, { $gte: date, $lte: date });
      } else if (path === '/team/stats') {
        assert.equal(data.present, 1);
      } else {
        assert.equal(data.history[0].present, 1);
      }
    }
  };

  await t.test('rejects an unrelated team even when the requester leads another team', async () => {
    await denied(`teamId=${otherTeamId}&sub=${studentId}&role=ADMIN`);
  });
  await t.test('allows a lead who is not in the members list', async () => allowed());
  await t.test('allows a T3 member who is not the lead', async () => {
    team.leadId = studentId;
    team.members.push(user._id);
    await allowed();
  });
  await t.test('checks current membership on each request, including teams without a lead', async () => {
    team.members = [studentId];
    team.leadId = null;
    await denied(`teamId=${teamId}`);
    team.leadId = user._id;
  });
  await t.test('preserves both administrator roles across unrelated teams', async () => {
    for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      user.role = role;
      await allowed(otherTeamId);
    }
    user.role = ROLES.T3_EXECUTIVE;
  });
  await t.test('rejects missing, malformed, repeated and operator team IDs before database access', async () => {
    const lookups = teamLookup.mock.callCount();
    for (const query of ['', 'teamId=', 'teamId=invalid', 'teamId=00000000000000000000000g',
      `teamId=${teamId}&teamId=${otherTeamId}`, `teamId[]=${teamId}`,
      `teamId[$in][]=${teamId}&teamId[$in][]=${otherTeamId}`, 'teamId[$ne]=null']) {
      await denied(query, 400);
    }
    assert.equal(teamLookup.mock.callCount(), lookups);
  });
  await t.test('rejects nonexistent teams without reading attendance', async () => {
    await denied(`teamId=${id('c')}`, 404);
  });
  await t.test('retains authentication, active account and role gates', async () => {
    await denied(`teamId=${teamId}`, 401, null);
    await denied(`teamId=${teamId}`, 401, tokens.sign(user, 'refresh', '5m'));
    user.isActive = false;
    await denied(`teamId=${teamId}`, 401);
    user.isActive = true;
    for (const role of [ROLES.T1_VOLUNTEER, ROLES.T2_ASSOCIATE]) {
      user.role = role;
      await denied(`teamId=${teamId}`);
    }
    user.role = ROLES.T3_EXECUTIVE;
  });
  await t.test('service calls fail closed without an authorized requester', async () => {
    const reads = attendanceQueries.length;
    for (const requester of [undefined, {}, { sub: String(user._id), role: ROLES.T2_ASSOCIATE }]) {
      for (const call of [
        () => service.getTeamAttendance(String(teamId), date, requester),
        () => service.getTeamAttendanceStats(String(teamId), date, requester),
        () => service.getTeamAttendanceHistory(String(teamId), 1, requester),
        () => service.getAttendanceSheet(String(teamId), date, date, requester),
      ]) await assert.rejects(call, { statusCode: 403 });
    }
    assert.equal(attendanceQueries.length, reads);
  });
});


const { ValidationError: TypedValidationError } = require('../../../core/errors/typedErrors');

function mockHistory(t, records = []) {
  const validTeamId = 'a'.repeat(24);
  const teamDoc = {
    _id: validTeamId,
    name: 'Fixture team',
    leadId: '1'.repeat(24),
    members: [{ toString: () => '1'.repeat(24) }, { toString: () => '2'.repeat(24) }],
    populate: async () => teamDoc,
  };
  const team = t.mock.method(Team, 'findById', (id) => {
    return Promise.resolve(teamDoc);
  });
  const attendance = t.mock.method(Attendance, 'find', async () => records);
  return { team, attendance, validTeamId };
}

test('history rejects invalid intervals before database access', async (t) => {
  const { team, attendance } = mockHistory(t);
  for (const days of [
    0, -1, 1.5, 31, 1000000, Number.MAX_SAFE_INTEGER, Infinity, NaN,
    '', '0', '-1', '1.5', '31', '1000000', '7junk', '1e6', '0x10', ' 7 ',
    'Infinity', '9'.repeat(400), null, true, [], ['7'], ['7', '30'], {}, { value: '7' },
  ]) {
    await assert.rejects(service.getTeamAttendanceHistory('team', days), TypedValidationError);
  }
  assert.equal(team.mock.callCount(), 0);
  assert.equal(attendance.mock.callCount(), 0);
});

test('history preserves the default, boundaries, empty days and aggregate results', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T12:00:00Z') });
  const { attendance, validTeamId } = mockHistory(t, [
    { date: '2026-10-01', status: 'present' },
    { date: '2026-10-01', status: 'late' },
    { date: '2026-09-30', status: 'absent' },
    { date: '2026-09-30', status: 'on_leave' },
  ]);
  const requester = { sub: '1'.repeat(24), role: ROLES.T3_EXECUTIVE };
  for (const input of [undefined, 1, '7', 30, '30']) {
    const days = input === undefined ? 7 : Number(input);
    const result = await service.getTeamAttendanceHistory(validTeamId, input, requester);
    assert.equal(result.days, days);
    assert.equal(result.history.length, days);
    assert.equal(result.overallPercentage, Math.round(100 / days));
    assert.equal(result.history.at(-1).date, '2026-10-01');
    assert.equal(result.history.at(-1).percentage, 100);
    assert.equal(result.history.at(-1).attended, 2);
    if (days > 1) {
      assert.equal(result.history.at(-2).absent, 1);
      assert.equal(result.history.at(-2).onLeave, 1);
      assert.equal(result.history[0].attended, 0);
    }
    const start = new Date('2026-10-01T12:00:00Z');
    start.setDate(start.getDate() - (days - 1));
    const startKey = start.toISOString().split('T')[0];
    assert.equal(result.history[0].date, startKey);
    assert.deepEqual(attendance.mock.calls.at(-1).arguments[0], {
      teamId: validTeamId, date: { $gte: startKey },
    });
  }
});

test('mounted history route validates raw query input and retains access controls', async (t) => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'attendance-test-secret-not-for-production';
  t.after(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });
  const tokens = require('../../auth/auth.tokens');
  const user = {
    _id: '1'.repeat(24), name: 'Fixture lead',
    email: 'lead@example.test', role: ROLES.T3_EXECUTIVE,
    isActive: true, password: 'fixture-password-hash', mustChangePassword: false,
  };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  const { team, attendance, validTeamId } = mockHistory(t);
  const app = express();
  app.use('/api/v1/attendance', require('../attendance.routes'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/attendance/team/history`;
  const token = tokens.sign(user, 'access', '5m');
  const request = (query, authenticated = true) => fetch(base + query, {
    headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
  });

  assert.equal((await request(`?teamId=${validTeamId}`, false)).status, 401);
  user.role = ROLES.T1_VOLUNTEER;
  assert.equal((await request(`?teamId=${validTeamId}`)).status, 403);
  user.role = ROLES.T3_EXECUTIVE;
  assert.equal((await request('?days=7')).status, 400);
  for (const query of [
    'days=', 'days=0', 'days=-1', 'days=1.5', 'days=31', 'days=1000000',
    'days=7junk', 'days=1e6', 'days=0x10', 'days=Infinity',
    'days=7&days=30', 'days[]=7', 'days[value]=7',
  ]) {
    const response = await request(`?teamId=${validTeamId}&${query}`);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), {
      success: false, message: 'days must be an integer between 1 and 30',
    });
  }
  assert.equal(team.mock.callCount(), 0);
  assert.equal(attendance.mock.callCount(), 0);

  for (const [query, days] of [['', 7], ['&days=1', 1], ['&days=7', 7], ['&days=30', 30]]) {
    const response = await request(`?teamId=${validTeamId}${query}`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.days, days);
    assert.equal(data.history.length, days);
    assert.equal(data.overallPercentage, 0);
    assert.ok(data.history.every(day => day.attended === 0));
  }
});
