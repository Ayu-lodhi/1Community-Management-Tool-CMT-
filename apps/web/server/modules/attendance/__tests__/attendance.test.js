const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../attendance.model');
const Team = require('../../teams/teams.model');
const User = require('../../admin/admin.model');
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
