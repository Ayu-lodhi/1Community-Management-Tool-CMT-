'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

const LEAD_ID   = '111111111111111111110001';
const OTHER_T3  = '111111111111111111110002';
const MEMBER_1  = '222222222222222222220001';
const MEMBER_2  = '222222222222222222220002';
const OUTSIDER  = '222222222222222222220003';
const UNRELATED = '222222222222222222220004';
const TEAM_ID   = '333333333333333333330001';
const TEAM_2_ID = '333333333333333333330002';
const TEAM_3_ID = '333333333333333333330003';

const teamsData = [
  { _id: TEAM_ID,   leadId: LEAD_ID,  members: [MEMBER_1] },
  { _id: TEAM_2_ID, leadId: LEAD_ID,  members: [MEMBER_2] },
  { _id: TEAM_3_ID, leadId: OTHER_T3, members: [OUTSIDER] },
];

const sampleAttendance = [
  // QR check-in records (user field populated)
  { user: MEMBER_1, date: '2026-03-01', status: 'late', method: 'qr' },
  { user: MEMBER_1, date: '2026-03-02', status: 'late', method: 'qr' },
  { user: MEMBER_1, date: '2026-03-03', status: 'present', method: 'qr' },
  { user: MEMBER_1, date: '2026-03-04', status: 'absent', method: 'qr' },

  // Manual/workforce records (studentId field populated)
  { studentId: MEMBER_2, date: '2026-03-05', status: 'on_leave', method: 'manual' },
  { studentId: MEMBER_2, date: '2026-03-06', status: 'late', method: 'manual' },

  // Outside record
  { user: OUTSIDER, date: '2026-03-01', status: 'late', method: 'qr' },

  // Different month
  { user: MEMBER_1, date: '2026-04-01', status: 'absent', method: 'qr' },
];

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith('attendance.model') || request.includes('attendance/attendance.model')) {
    return {
      find(filter = {}) {
        return {
          select() {
            return {
              lean() {
                const targetIds = (filter.user?.$in || []).map(String);
                const matched = sampleAttendance.filter((r) => {
                  const uId = String(r.user || r.studentId);
                  const inTarget = targetIds.includes(uId);
                  let inMonth = true;
                  if (filter.date?.$gte && filter.date?.$lte) {
                    inMonth = r.date >= filter.date.$gte && r.date <= filter.date.$lte;
                  } else if (filter.date?.$regex) {
                    const monthPrefix = filter.date.$regex.replace('^', '');
                    inMonth = r.date.startsWith(monthPrefix);
                  }
                  const inStatus = filter.status?.$in ? filter.status.$in.includes(r.status) : true;
                  return inTarget && inMonth && inStatus;
                });
                return Promise.resolve(matched);
              },
            };
          },
        };
      },
    };
  }
  if (request.endsWith('teams.model') || request.includes('teams/teams.model')) {
    return {
      find({ leadId } = {}) {
        const leadStr = leadId?.toString();
        const matched = teamsData.filter((t) => !leadStr || String(t.leadId) === leadStr);
        return {
          select() {
            return {
              lean() { return Promise.resolve(matched); },
            };
          },
        };
      },
      findById(id) {
        const t = teamsData.find((x) => String(x._id) === String(id));
        return {
          select() {
            return {
              lean() { return Promise.resolve(t || null); },
            };
          },
        };
      },
    };
  }
  if (request.endsWith('admin.model') || request.includes('admin/admin.model')) {
    return {
      find({ _id } = {}) {
        const ids = (_id?.$in || []).map(String);
        const users = [
          { _id: MEMBER_1, name: 'Alice Member' },
          { _id: MEMBER_2, name: 'Bob Member' },
          { _id: OUTSIDER, name: 'Charlie Outsider' },
          { _id: UNRELATED, name: 'Dave Unrelated' },
        ].filter((u) => ids.includes(u._id));
        return {
          select() {
            return { lean() { return Promise.resolve(users); } };
          },
        };
      },
      findById(id) {
        return {
          select() {
            return {
              lean() {
                if (String(id) === MEMBER_1) return Promise.resolve({ _id: MEMBER_1, name: 'Alice Member' });
                if (String(id) === MEMBER_2) return Promise.resolve({ _id: MEMBER_2, name: 'Bob Member' });
                if (String(id) === OUTSIDER) return Promise.resolve({ _id: OUTSIDER, name: 'Charlie Outsider' });
                if (String(id) === UNRELATED) return Promise.resolve({ _id: UNRELATED, name: 'Dave Unrelated' });
                return Promise.resolve(null);
              },
            };
          },
        };
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Clear caches
delete require.cache[require.resolve('../modules/hr/hr.exceptions.controller')];
delete require.cache[require.resolve('../modules/hr/hr.exceptions.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const exceptionsRouter = require('../modules/hr/hr.exceptions.routes');
Module._load = origLoad;

function runRoute(method, url, { user, query } = {}) {
  currentUser = user || null;
  return new Promise((resolve) => {
    const qStr = query ? '?' + new URLSearchParams(query).toString() : '';
    const req = {
      method,
      url: url + qStr,
      originalUrl: `/api/v1/hr${url}${qStr}`,
      headers: {},
      ip: '127.0.0.1',
      body: {},
      query: query || {},
      params: {},
    };
    let statusCode = 200;
    let responseBody = null;
    const res = {
      statusCode: 200,
      on(event, cb) {
        if (event === 'finish') setTimeout(cb, 0);
      },
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
    };
    exceptionsRouter.handle(req, res, (err) => {
      if (err) resolve({ statusCode: err.statusCode || 500, body: { err: err.message } });
      else resolve({ statusCode: statusCode || 404, body: responseBody });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────
test('Attendance Exceptions: counts late, absent, on_leave; rejects T1/T2; no pay fields', async (t) => {
  await new Promise((r) => setTimeout(r, 400));

  await t.test('T1 is denied (403)', async () => {
    const res = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: 't1_user', role: 'T1_VOLUNTEER' },
      query: { month: '2026-03' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T2 is denied (403)', async () => {
    const res = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: 't2_user', role: 'T2_ASSOCIATE' },
      query: { month: '2026-03' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Missing month parameter returns 400', async () => {
    const res = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: {},
    });
    assert.equal(res.statusCode, 400);
  });

  await t.test('Invalid month format returns 400', async () => {
    const res = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: { month: 'bad-month' },
    });
    assert.equal(res.statusCode, 400);
  });

  await t.test('T3 leading two teams sees people from both in exception summary (200)', async () => {
    const res = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: { month: '2026-03' },
    });
    assert.equal(res.statusCode, 200, `Failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.length, 2);

    const alice = res.body.data.find((e) => e.employeeId === MEMBER_1);
    assert.ok(alice);
    assert.equal(alice.lateCount, 2, 'Alice in Team 1 has 2 lates');
    assert.equal(alice.absentCount, 1, 'Alice in Team 1 has 1 absent');
    assert.equal(alice.onLeaveCount, 0, 'Alice in Team 1 has 0 on_leave');

    const bob = res.body.data.find((e) => e.employeeId === MEMBER_2);
    assert.ok(bob);
    assert.equal(bob.lateCount, 1, 'Bob in Team 2 has 1 late (from manual record)');
    assert.equal(bob.onLeaveCount, 1, 'Bob in Team 2 has 1 on_leave (from manual record)');
    assert.equal(bob.absentCount, 0, 'Bob in Team 2 has 0 absent');

    // Strict verification: No payments, payroll, advances or salary anywhere
    for (const item of res.body.data) {
      assert.equal(item.payableDays, undefined);
      assert.equal(item.pay, undefined);
      assert.equal(item.salary, undefined);
      assert.equal(item.advance, undefined);
      assert.equal(item.penaltyDays, undefined);
    }
  });

  await t.test('T3 querying member of another team or an unrelated person is denied (403)', async () => {
    // 1. Member of another team
    const res1 = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: { month: '2026-03', employeeId: OUTSIDER },
    });
    assert.equal(res1.statusCode, 403);

    // 2. Unrelated person in no team
    const res2 = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: { month: '2026-03', employeeId: UNRELATED },
    });
    assert.equal(res2.statusCode, 403);
  });

  await t.test('Read gating: ADMIN lacking hr:incidents_manage is denied 403 on GET /attendance-exceptions', async () => {
    const res = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: 'admin_res', role: 'ADMIN', customGrants: ['events:read'] },
      query: { month: '2026-03' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Read gating: ADMIN with defaults and SUPER_ADMIN can read GET /attendance-exceptions', async () => {
    const resAdmin = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: 'admin_def', role: 'ADMIN' },
      query: { month: '2026-03' },
    });
    assert.equal(resAdmin.statusCode, 200);

    const resSuper = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: 'super', role: 'SUPER_ADMIN' },
      query: { month: '2026-03' },
    });
    assert.equal(resSuper.statusCode, 200);
  });

  await t.test('Date range query isolates month boundary and excludes adjacent months', async () => {
    const resApr = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: { month: '2026-04' },
    });
    assert.equal(resApr.statusCode, 200);
    const aliceApr = resApr.body.data.find((e) => e.employeeId === MEMBER_1);
    assert.ok(aliceApr);
    assert.equal(aliceApr.absentCount, 1);
    assert.equal(aliceApr.lateCount, 0);

    const resMay = await runRoute('GET', '/attendance-exceptions', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      query: { month: '2026-05' },
    });
    assert.equal(resMay.statusCode, 200);
    const aliceMay = resMay.body.data.find((e) => e.employeeId === MEMBER_1);
    assert.ok(aliceMay);
    assert.equal(aliceMay.lateCount, 0);
    assert.equal(aliceMay.absentCount, 0);
    assert.equal(aliceMay.onLeaveCount, 0);
  });

  // Restore protect
  authMw.protect = origProtect;
});
