'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── In-memory state & IDs ──────────────────────────────────────────────────
const T3_LEAD_MULTI  = '111111111111111111110001'; // Leads Team 1 and Team 2
const T3_LEAD_OTHER  = '111111111111111111110002'; // Leads Team 3
const T3_MEMBER_ONLY = '111111111111111111110003'; // Member of Team 1, not lead
const T1_USER        = '222222222222222222220001';
const T2_USER        = '222222222222222222220002';

const MEMBER_TEAM1   = '333333333333333333330001'; // Member of Team 1
const MEMBER_TEAM2   = '333333333333333333330002'; // Member of Team 2
const REMOVED_MEMBER = '333333333333333333330003'; // Removed from Team.members, but User.teamId still set
const OUTSIDER       = '333333333333333333330004'; // In no team

const TEAM1_ID = '444444444444444444440001';
const TEAM2_ID = '444444444444444444440002';
const TEAM3_ID = '444444444444444444440003';

const teamsData = [
  { _id: TEAM1_ID, leadId: T3_LEAD_MULTI, members: [MEMBER_TEAM1, T3_MEMBER_ONLY] },
  { _id: TEAM2_ID, leadId: T3_LEAD_MULTI, members: [MEMBER_TEAM2] },
  { _id: TEAM3_ID, leadId: T3_LEAD_OTHER, members: [OUTSIDER] },
];

const usersData = new Map([
  [T3_LEAD_MULTI,  { _id: T3_LEAD_MULTI,  name: 'Multi Lead',  role: 'T3_EXECUTIVE' }],
  [T3_LEAD_OTHER,  { _id: T3_LEAD_OTHER,  name: 'Other Lead',  role: 'T3_EXECUTIVE' }],
  [T3_MEMBER_ONLY, { _id: T3_MEMBER_ONLY, name: 'Just Member', role: 'T3_EXECUTIVE' }],
  [T1_USER,        { _id: T1_USER,        name: 'T1 Vol',      role: 'T1_VOLUNTEER' }],
  [T2_USER,        { _id: T2_USER,        name: 'T2 Assoc',    role: 'T2_ASSOCIATE' }],
  [MEMBER_TEAM1,   { _id: MEMBER_TEAM1,   name: 'Alice Team1', role: 'T1_VOLUNTEER', teamId: TEAM1_ID }],
  [MEMBER_TEAM2,   { _id: MEMBER_TEAM2,   name: 'Bob Team2',   role: 'T1_VOLUNTEER', teamId: TEAM2_ID }],
  [REMOVED_MEMBER, { _id: REMOVED_MEMBER, name: 'Charlie Rem', role: 'T1_VOLUNTEER', teamId: TEAM1_ID }], // Note: User.teamId set, but NOT in Team1.members!
  [OUTSIDER,       { _id: OUTSIDER,       name: 'Dave Out',    role: 'T1_VOLUNTEER', teamId: TEAM3_ID }],
]);

const incidentsStore = new Map();
const capturedAuditLogs = [];
let incSeq = 1;

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('AuditLog.model') || request.endsWith('AuditLog.model')) {
    return {
      create(entry) {
        capturedAuditLogs.push(entry);
        return Promise.resolve({ _id: 'audit_' + capturedAuditLogs.length, ...entry });
      },
    };
  }
  if (request.includes('MonthLock.model')) {
    return {
      findOne({ month, isLocked } = {}) {
        if (isLocked && month === '2026-01') {
          return Promise.resolve({ month: '2026-01', isLocked: true });
        }
        return Promise.resolve(null);
      },
    };
  }
  if (request.includes('hr.incidents.model')) {
    return {
      create(data) {
        const id = '55555555555555555555' + String(incSeq++).padStart(4, '0');
        const doc = {
          _id: id,
          ...data,
          isResolved: false,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          async save() {
            incidentsStore.set(id, this);
            return this;
          },
        };
        incidentsStore.set(id, doc);
        return Promise.resolve(doc);
      },
      find(filter = {}) {
        return {
          sort() {
            return {
              lean() {
                let list = Array.from(incidentsStore.values());
                if (filter.isDeleted?.$ne) list = list.filter((i) => !i.isDeleted);
                if (filter.employeeId) {
                  if (filter.employeeId.$in) list = list.filter((i) => filter.employeeId.$in.includes(i.employeeId));
                  else list = list.filter((i) => i.employeeId === filter.employeeId);
                }
                if (filter.teamId) {
                  if (filter.teamId.$in) list = list.filter((i) => filter.teamId.$in.map(String).includes(String(i.teamId)));
                  else list = list.filter((i) => String(i.teamId) === String(filter.teamId));
                }
                return Promise.resolve(list);
              },
            };
          },
        };
      },
      findOne(filter = {}) {
        const targetId = filter._id?.toString();
        const found = incidentsStore.get(targetId);
        const doc = found && (!filter.isDeleted?.$ne || !found.isDeleted) ? {
          ...found,
          async save() {
            incidentsStore.set(targetId, this);
            return this;
          },
        } : null;
        return {
          lean() { return Promise.resolve(doc ? { ...found } : null); },
          then(resolve, reject) { return Promise.resolve(doc).then(resolve, reject); },
        };
      },
      findById(id) {
        return this.findOne({ _id: id });
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
    return {
      findById(id) {
        const u = usersData.get(id?.toString());
        return {
          select() { return Promise.resolve(u || null); },
        };
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Clear caches
delete require.cache[require.resolve('../modules/hr/hr.permissions')];
delete require.cache[require.resolve('../modules/hr/hr.incidents.controller')];
delete require.cache[require.resolve('../modules/hr/hr.incidents.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const incidentsRouter = require('../modules/hr/hr.incidents.routes');
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
    incidentsRouter.handle(req, res, (err) => {
      if (err) resolve({ statusCode: err.statusCode || 500, body: { err: err.message } });
      else resolve({ statusCode: statusCode || 404, body: responseBody });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('Incident Reports: Comprehensive Access & Lifecycle Tests', async (t) => {
  await new Promise((r) => setTimeout(r, 400));
  incidentsStore.clear();
  capturedAuditLogs.length = 0;
  const mongoose = require('mongoose');
  const origReadyState = mongoose.connection.readyState;
  mongoose.connection.readyState = 1;

  // 1. T1 and T2 denied
  await t.test('T1 volunteer is denied (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T1_USER, role: 'T1_VOLUNTEER' },
      body: {
        employeeId: MEMBER_TEAM1,
        feedbackType: 'POSITIVE',
        title: 'Good job',
        narrative: 'Did well on shift',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T2 associate is denied (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T2_USER, role: 'T2_ASSOCIATE' },
      body: {
        employeeId: MEMBER_TEAM1,
        feedbackType: 'POSITIVE',
        title: 'Good job',
        narrative: 'Did well on shift',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // 2. Self-report denied
  await t.test('Self-report denied: lead cannot report on themselves (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: {
        employeeId: T3_LEAD_MULTI,
        feedbackType: 'POSITIVE',
        title: 'Self praise',
        narrative: 'I am amazing',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // 3. Lead of another team denied
  await t.test('Lead of another team denied (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_OTHER, role: 'T3_EXECUTIVE' },
      body: {
        employeeId: MEMBER_TEAM1,
        feedbackType: 'NEGATIVE',
        title: 'Late',
        narrative: 'Arrived late',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // 4. A T3 who is only a member is denied
  await t.test('T3 who is only a member (not lead) is denied (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T3_MEMBER_ONLY, role: 'T3_EXECUTIVE' },
      body: {
        employeeId: MEMBER_TEAM1,
        feedbackType: 'NEGATIVE',
        title: 'Peer report',
        narrative: 'Peer did not cooperate',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // 5. A removed member whose User.teamId is still set is denied
  await t.test('Removed member with stale User.teamId is denied (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: {
        employeeId: REMOVED_MEMBER,
        feedbackType: 'NEGATIVE',
        title: 'Missing',
        narrative: 'Never showed up',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // 6. Lead whose Team.members does not contain the person is denied
  await t.test('Lead whose Team.members does not contain person is denied (403)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: {
        employeeId: OUTSIDER,
        feedbackType: 'NEGATIVE',
        title: 'Outsider report',
        narrative: 'Not in team',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // 7. Team from body ignored
  let createdIncidentId = null;
  await t.test('Team from body ignored: teamId derived from DB (201)', async () => {
    const res = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE', name: 'Multi Lead' },
      body: {
        employeeId: MEMBER_TEAM1,
        teamId: TEAM3_ID, // Fake team from body
        feedbackType: 'POSITIVE',
        title: 'Great presentation',
        narrative: 'Delivered an excellent update',
        severity: 'LOW',
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(String(res.body.data.teamId), TEAM1_ID, 'teamId must match DB-derived team, not body!');
    createdIncidentId = res.body.data._id;
  });

  // 8. T3 leading two teams works for people in both
  await t.test('T3 leading two teams works for people in both (201)', async () => {
    const res2 = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE', name: 'Multi Lead' },
      body: {
        employeeId: MEMBER_TEAM2,
        feedbackType: 'POSITIVE',
        title: 'Team 2 star',
        narrative: 'Great work in Team 2',
      },
    });
    assert.equal(res2.statusCode, 201);
    assert.equal(String(res2.body.data.teamId), TEAM2_ID);
  });

  // 9. Edits logged (before and after in audit entry)
  await t.test('Edits update narrative and title (200) and audit entry contains before and after', async () => {
    const res = await runRoute('PATCH', `/incidents/${createdIncidentId}`, {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: {
        title: 'Updated Title',
        narrative: 'Updated narrative with additional details',
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.title, 'Updated Title');
    assert.equal(res.body.data.narrative, 'Updated narrative with additional details');

    const editAudit = capturedAuditLogs.find((l) => l.action === 'HR_INCIDENT_UPDATE' && String(l.targetId) === String(createdIncidentId));
    assert.ok(editAudit, 'Audit entry for edit must be recorded');
    assert.equal(editAudit.details.oldValue.title, 'Great presentation');
    assert.equal(editAudit.details.newValue.title, 'Updated Title');
    assert.equal(editAudit.details.newValue.narrative, 'Updated narrative with additional details');
  });

  // 10. Resolve incident
  await t.test('Resolve incident with resolution notes (200)', async () => {
    const res = await runRoute('POST', `/incidents/${createdIncidentId}/resolve`, {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: { resolutionNotes: 'Reviewed in weekly sync' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.isResolved, true);
    assert.equal(res.body.data.resolutionNotes, 'Reviewed in weekly sync');
  });

  // 11. Soft delete with reason (No hard delete)
  await t.test('Soft delete requires reason and marks isDeleted=true (200)', async () => {
    const res = await runRoute('DELETE', `/incidents/${createdIncidentId}`, {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: { deletedReason: 'Logged in error by supervisor' },
    });
    assert.equal(res.statusCode, 200);

    // Verify subsequent lookup returns 404
    const getRes = await runRoute('GET', `/incidents/${createdIncidentId}`, {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
    });
    assert.equal(getRes.statusCode, 404);
  });

  await t.test('Soft delete fails if reason missing or too short (400)', async () => {
    const res = await runRoute('DELETE', `/incidents/${createdIncidentId}`, {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: { deletedReason: 'no' },
    });
    assert.equal(res.statusCode, 400);
  });

  // 12. Month lock is NOT applied to incidents
  await t.test('Month lock is NOT applied to incidents: creating and editing in locked month succeeds (201/200)', async () => {
    const createRes = await runRoute('POST', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE', name: 'Multi Lead' },
      body: {
        employeeId: MEMBER_TEAM1,
        date: '2026-01-15', // 2026-01 is locked in MonthLock
        feedbackType: 'NEUTRAL',
        title: 'Locked Month Incident',
        narrative: 'Created during locked month',
      },
    });
    assert.equal(createRes.statusCode, 201);
    const incId = createRes.body.data._id;
    createdIncidentId = incId;

    const editRes = await runRoute('PATCH', `/incidents/${incId}`, {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
      body: {
        narrative: 'Edited during locked month',
      },
    });
    assert.equal(editRes.statusCode, 200);
    assert.equal(editRes.body.data.narrative, 'Edited during locked month');
  });

  // 13. Read gating with requireAdminPermission('hr:incidents_manage')
  await t.test('Read gating: ADMIN lacking hr:incidents_manage is denied 403 on GET /incidents', async () => {
    const res = await runRoute('GET', '/incidents', {
      user: { sub: 'admin_res', role: 'ADMIN', customGrants: ['events:read'] },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Read gating: ADMIN lacking hr:incidents_manage is denied 403 on GET /incidents/:id', async () => {
    const res = await runRoute('GET', `/incidents/${createdIncidentId}`, {
      user: { sub: 'admin_res', role: 'ADMIN', customGrants: ['events:read'] },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Read gating: ADMIN with defaults can read GET /incidents and GET /incidents/:id', async () => {
    const resList = await runRoute('GET', '/incidents', {
      user: { sub: 'admin_def', role: 'ADMIN' },
    });
    assert.equal(resList.statusCode, 200);

    const resOne = await runRoute('GET', `/incidents/${createdIncidentId}`, {
      user: { sub: 'admin_def', role: 'ADMIN' },
    });
    assert.equal(resOne.statusCode, 200);
  });

  await t.test('Read gating: SUPER_ADMIN and T3 lead can read incidents (unaffected)', async () => {
    const resSuper = await runRoute('GET', '/incidents', {
      user: { sub: 'super', role: 'SUPER_ADMIN' },
    });
    assert.equal(resSuper.statusCode, 200);

    const resT3 = await runRoute('GET', '/incidents', {
      user: { sub: T3_LEAD_MULTI, role: 'T3_EXECUTIVE' },
    });
    assert.equal(resT3.statusCode, 200);
  });

  // Restore protect & readyState
  authMw.protect = origProtect;
  mongoose.connection.readyState = origReadyState;
});
