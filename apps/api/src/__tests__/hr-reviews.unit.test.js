'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePerformanceScore } = require('../modules/hr/hr.calculations');

// ── Pure calculation formula tests (exact engine expectations) ────────────
test('Performance calculations: weighted score formula, zero weights, invalid scores', async (t) => {
  await t.test('Standard weighted score matches engine expectation (86%)', () => {
    const items = [
      { benchmarkScore: 10, weight: 2, obtainedScore: 8 }, // max: 20, obt: 16
      { benchmarkScore: 10, weight: 3, obtainedScore: 9 }, // max: 30, obt: 27
    ];
    const score = calculatePerformanceScore(items);
    assert.equal(score.maxWeightedScore, 50);
    assert.equal(score.obtainedWeightedScore, 43);
    assert.equal(score.netScorePercentage, 86);
  });

  await t.test('All zero weights returns 0% without division by zero', () => {
    const items = [
      { benchmarkScore: 10, weight: 0, obtainedScore: 8 },
      { benchmarkScore: 10, weight: 0, obtainedScore: 9 },
    ];
    const score = calculatePerformanceScore(items);
    assert.equal(score.maxWeightedScore, 0);
    assert.equal(score.obtainedWeightedScore, 0);
    assert.equal(score.netScorePercentage, 0);
  });

  await t.test('Mixed zero and non-zero weights', () => {
    const items = [
      { benchmarkScore: 10, weight: 0, obtainedScore: 8 }, // 0
      { benchmarkScore: 20, weight: 2, obtainedScore: 15 }, // max: 40, obt: 30
    ];
    const score = calculatePerformanceScore(items);
    assert.equal(score.maxWeightedScore, 40);
    assert.equal(score.obtainedWeightedScore, 30);
    assert.equal(score.netScorePercentage, 75);
  });

  await t.test('Invalid scores: obtained > benchmark is clamped to benchmark', () => {
    const items = [
      { benchmarkScore: 10, weight: 1, obtainedScore: 999 }, // clamps to 10
    ];
    const score = calculatePerformanceScore(items);
    assert.equal(score.maxWeightedScore, 10);
    assert.equal(score.obtainedWeightedScore, 10);
    assert.equal(score.netScorePercentage, 100);
  });

  await t.test('Invalid scores: negative obtained score is clamped to 0', () => {
    const items = [
      { benchmarkScore: 10, weight: 1, obtainedScore: -50 }, // clamps to 0
    ];
    const score = calculatePerformanceScore(items);
    assert.equal(score.maxWeightedScore, 10);
    assert.equal(score.obtainedWeightedScore, 0);
    assert.equal(score.netScorePercentage, 0);
  });

  await t.test('Empty or null items returns zeros', () => {
    assert.deepEqual(calculatePerformanceScore([]), { maxWeightedScore: 0, obtainedWeightedScore: 0, netScorePercentage: 0 });
    assert.deepEqual(calculatePerformanceScore(null), { maxWeightedScore: 0, obtainedWeightedScore: 0, netScorePercentage: 0 });
  });
});

// ── In-memory state & mocks for router tests ────────────────────────────────
const LEAD_ID   = '111111111111111111110001'; // Leads Team 1 and Team 2
const OTHER_T3  = '111111111111111111110002'; // Leads Team 3
const MEMBER_ID = '222222222222222222220001'; // In Team 1
const MEMBER_2  = '222222222222222222220002'; // In Team 2
const MEMBER_3  = '222222222222222222220003'; // In Team 3
const ADMIN_ID  = '333333333333333333330001';
const TEAM_ID   = '444444444444444444440001';
const TEAM_2_ID = '444444444444444444440002';
const TEAM_3_ID = '444444444444444444440003';

const teamsData = [
  { _id: TEAM_ID,   leadId: LEAD_ID,  members: [MEMBER_ID] },
  { _id: TEAM_2_ID, leadId: LEAD_ID,  members: [MEMBER_2] },
  { _id: TEAM_3_ID, leadId: OTHER_T3, members: [MEMBER_3] },
];

const reviewsStore = new Map(); // key: `${employeeId}_${period}`
const lockedMonths = new Set(['2026-01']); // 2026-01 is locked

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('hr.reviews.model')) {
    return {
      findOneAndUpdate({ employeeId, period }, update, opts) {
        const key = `${employeeId}_${period}`;
        const existing = reviewsStore.get(key) || { _id: 'rev_' + key, employeeId, period };
        const updated = { ...existing, ...(update.$set || {}) };
        reviewsStore.set(key, updated);
        return Promise.resolve(updated);
      },
      find(filter = {}) {
        return {
          sort() {
            return {
              lean() {
                let list = Array.from(reviewsStore.values());
                if (filter.employeeId) list = list.filter((r) => String(r.employeeId) === String(filter.employeeId));
                if (filter.teamId) list = list.filter((r) => String(r.teamId) === String(filter.teamId));
                if (filter.period) list = list.filter((r) => r.period === filter.period);
                return Promise.resolve(list);
              },
            };
          },
        };
      },
    };
  }
  if (request.endsWith('teams.model') || request.includes('teams/teams.model')) {
    return {
      findOne({ leadId, members } = {}) {
        const leadStr = leadId?.toString();
        const memberStr = members?.toString();
        const matched = teamsData.find(
          (t) => (!leadStr || String(t.leadId) === leadStr) &&
                 (!memberStr || t.members.map(String).includes(memberStr))
        );
        const res = matched ? { ...matched, _id: matched._id } : null;
        return {
          lean() { return Promise.resolve(res); },
          then(resolve, reject) { return Promise.resolve(res).then(resolve, reject); },
        };
      },
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
        const res = t ? { ...t, _id: t._id } : null;
        return {
          lean() { return Promise.resolve(res); },
          select() { return this; },
          then(resolve, reject) { return Promise.resolve(res).then(resolve, reject); },
        };
      },
    };
  }
  if (request.endsWith('admin.model') || request.includes('admin/admin.model')) {
    const usersMap = new Map([
      [MEMBER_ID, { _id: MEMBER_ID, name: 'Alice Volunteer' }],
      [MEMBER_2,  { _id: MEMBER_2,  name: 'Bob Volunteer' }],
      [MEMBER_3,  { _id: MEMBER_3,  name: 'Charlie Volunteer' }],
    ]);
    return {
      findById(id) {
        const u = usersMap.get(String(id));
        return {
          select() { return Promise.resolve(u || null); },
        };
      },
    };
  }
  if (request.includes('MonthLock.model')) {
    return {
      findOne({ month, isLocked } = {}) {
        if (isLocked && lockedMonths.has(month)) {
          return Promise.resolve({ month, isLocked: true });
        }
        return Promise.resolve(null);
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Clear caches
delete require.cache[require.resolve('../modules/hr/hr.permissions')];
delete require.cache[require.resolve('../modules/hr/hr.reviews.controller')];
delete require.cache[require.resolve('../modules/hr/hr.reviews.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const reviewsRouter = require('../modules/hr/hr.reviews.routes');
Module._load = origLoad;

function runRoute(method, url, { user, body, query } = {}) {
  currentUser = user || null;
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      originalUrl: `/api/v1/hr${url}`,
      headers: {},
      ip: '127.0.0.1',
      body: body || {},
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
    reviewsRouter.handle(req, res, (err) => {
      if (err) resolve({ statusCode: err.statusCode || 500, body: { err: err.message } });
      else resolve({ statusCode: statusCode || 404, body: responseBody });
    });
  });
}

// ── Router Tests ──────────────────────────────────────────────────────────
test('HR Reviews: Access rules, Month lock, and Review submission', async (t) => {
  await new Promise((r) => setTimeout(r, 400));
  reviewsStore.clear();

  const sampleItems = [
    { factorName: 'Attendance', benchmarkScore: 10, weight: 2, obtainedScore: 8 },
    { factorName: 'Initiative', benchmarkScore: 10, weight: 3, obtainedScore: 9 },
  ];

  await t.test('T1 volunteer is denied (403)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: 't1_user', role: 'T1_VOLUNTEER' },
      body: { employeeId: MEMBER_ID, period: '2026-03', items: sampleItems },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Self-review is denied (403)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      body: { employeeId: LEAD_ID, period: '2026-03', items: sampleItems },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Lead of another team is denied (403)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: OTHER_T3, role: 'T3_EXECUTIVE' },
      body: { employeeId: MEMBER_ID, period: '2026-03', items: sampleItems },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Month lock blocks review in locked month (403)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      body: { employeeId: MEMBER_ID, period: '2026-01', items: sampleItems }, // 2026-01 is locked
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /locked against modifications/);
  });

  await t.test('Lead of member can submit review in unlocked month (201, 86%)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE', name: 'Lead Multi' },
      body: {
        employeeId: MEMBER_ID,
        period: '2026-03',
        items: sampleItems,
        notes: 'Great performance this quarter',
      },
    });
    assert.equal(res.statusCode, 201, `Failed to submit review: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.netScorePercentage, 86);
    assert.equal(String(res.body.data.teamId), TEAM_ID);
  });

  await t.test('One review per person per period: re-submitting updates the period record (201)', async () => {
    const updatedItems = [
      { factorName: 'Attendance', benchmarkScore: 10, weight: 2, obtainedScore: 10 },
      { factorName: 'Initiative', benchmarkScore: 10, weight: 3, obtainedScore: 10 },
    ];
    const res = await runRoute('POST', '/reviews', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE', name: 'Lead Multi' },
      body: { employeeId: MEMBER_ID, period: '2026-03', items: updatedItems },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.netScorePercentage, 100);
    // Ensure only 1 record exists for (MEMBER_ID, 2026-03)
    assert.equal(reviewsStore.size, 1);
  });

  await t.test('ADMIN with customGrants missing hr:reviews_manage is denied (403)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: ADMIN_ID, role: 'ADMIN', customGrants: ['events:read'] },
      body: { employeeId: MEMBER_ID, period: '2026-04', items: sampleItems },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T3 leading two teams can review people in both teams (201)', async () => {
    // Review for Member 1 in Team 1
    const res1 = await runRoute('POST', '/reviews', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE', name: 'Multi Lead' },
      body: { employeeId: MEMBER_ID, period: '2026-05', items: sampleItems },
    });
    assert.equal(res1.statusCode, 201);
    assert.equal(String(res1.body.data.teamId), TEAM_ID);

    // Review for Member 2 in Team 2
    const res2 = await runRoute('POST', '/reviews', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE', name: 'Multi Lead' },
      body: { employeeId: MEMBER_2, period: '2026-05', items: sampleItems },
    });
    assert.equal(res2.statusCode, 201);
    assert.equal(String(res2.body.data.teamId), TEAM_2_ID);
  });

  await t.test('ADMIN with default permissions can submit a review (201)', async () => {
    const res = await runRoute('POST', '/reviews', {
      user: { sub: ADMIN_ID, role: 'ADMIN', name: 'Admin User' },
      body: { employeeId: MEMBER_ID, period: '2026-06', items: sampleItems, teamId: TEAM_ID },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(String(res.body.data.teamId), TEAM_ID);
  });

  await t.test('Read gating: ADMIN lacking hr:reviews_manage is denied 403 on GET /reviews and GET /reviews/employee/:id', async () => {
    const resList = await runRoute('GET', '/reviews', {
      user: { sub: 'admin_res', role: 'ADMIN', customGrants: ['events:read'] },
    });
    assert.equal(resList.statusCode, 403);

    const resEmp = await runRoute('GET', `/reviews/employee/${MEMBER_ID}`, {
      user: { sub: 'admin_res', role: 'ADMIN', customGrants: ['events:read'] },
    });
    assert.equal(resEmp.statusCode, 403);
  });

  await t.test('Read gating: ADMIN with defaults, SUPER_ADMIN and T3 lead can read reviews', async () => {
    const resAdmin = await runRoute('GET', '/reviews', {
      user: { sub: 'admin_def', role: 'ADMIN' },
    });
    assert.equal(resAdmin.statusCode, 200);

    const resSuper = await runRoute('GET', `/reviews/employee/${MEMBER_ID}`, {
      user: { sub: 'super', role: 'SUPER_ADMIN' },
    });
    assert.equal(resSuper.statusCode, 200);

    const resT3 = await runRoute('GET', `/reviews/employee/${MEMBER_ID}`, {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
    });
    assert.equal(resT3.statusCode, 200);
  });

  // Restore protect
  authMw.protect = origProtect;
});
