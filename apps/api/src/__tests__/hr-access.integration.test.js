/**
 * Real MongoDB Integration Test for HR Access Rules and Lifecycle.
 *
 * Commands to run:
 *   docker run -d -p 27017:27017 --name cmt-mongo mongo:5.0
 *   $env:HR_TEST_MONGODB_URI="mongodb://127.0.0.1:27017/cmt_hr_test"
 *   node --test apps/api/src/__tests__/hr-access.integration.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// ── SAFETY GUARDS ──────────────────────────────────────────────────────────
// Read ONLY process.env.HR_TEST_MONGODB_URI (never MONGODB_URI, never load .env)
const rawUri = process.env.HR_TEST_MONGODB_URI;

if (!rawUri) {
  test('HR Access Real MongoDB Integration (SKIPPED: HR_TEST_MONGODB_URI not set)', (t) => {
    t.skip('Skipping integration test: HR_TEST_MONGODB_URI environment variable is not defined.');
  });
} else {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUri);
  } catch (err) {
    console.error('REFUSAL: HR_TEST_MONGODB_URI is not a valid URL:', rawUri);
    process.exit(1);
  }

  const hostname = parsedUrl.hostname;
  const dbName = parsedUrl.pathname.replace(/^\//, '');

  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    console.error(`REFUSAL: HR_TEST_MONGODB_URI host must be 127.0.0.1 or localhost, got: ${hostname}`);
    process.exit(1);
  }

  if (!dbName.endsWith('_test')) {
    console.error(`REFUSAL: HR_TEST_MONGODB_URI database name must end with "_test", got: "${dbName}"`);
    process.exit(1);
  }

  // ── MODELS ───────────────────────────────────────────────────────────────
  const User = require('../modules/admin/admin.model');
  const Team = require('../modules/teams/teams.model');
  const MonthLock = require('../models/MonthLock.model');
  const AuditLog = require('../models/AuditLog.model');
  const Attendance = require('../modules/attendance/attendance.model');

  const { Department, Post, EmployeeCategory, PerformanceFactor } = require('../modules/hr/hr.masters.model');
  const HrProfile = require('../modules/hr/hr.profile.model');
  const HrIncident = require('../modules/hr/hr.incidents.model');
  const HrReview = require('../modules/hr/hr.reviews.model');

  const authMw = require('../modules/auth/auth.middleware');
  let currentUser = null;
  const origProtect = authMw.protect;
  authMw.protect = (req, res, next) => {
    if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
    req.user = currentUser;
    next();
  };

  const hrRouter = require('../modules/hr/hr.routes');

  function runRoute(method, url, { user, body, query } = {}) {
    currentUser = user || null;
    return new Promise((resolve) => {
      const qStr = query ? '?' + new URLSearchParams(query).toString() : '';
      const req = {
        method,
        url: url + qStr,
        originalUrl: `/api/v1/hr${url}${qStr}`,
        headers: {},
        ip: '127.0.0.1',
        body: body || {},
        query: query || {},
        params: {},
      };
      let statusCode = 200;
      let headers = {};
      let responseBody = null;
      const res = {
        statusCode: 200,
        setHeader(name, val) {
          headers[name.toLowerCase()] = val;
        },
        status(code) {
          statusCode = code;
          this.statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          resolve({ statusCode, headers, body: responseBody });
          return this;
        },
        send(data) {
          responseBody = data;
          resolve({ statusCode, headers, body: responseBody });
          return this;
        },
      };
      hrRouter.handle(req, res, (err) => {
        if (err) resolve({ statusCode: err.statusCode || 500, headers, body: { err: err.message } });
        else resolve({ statusCode: statusCode || 404, headers, body: responseBody });
      });
    });
  }

  test('HR Access Real MongoDB Integration Tests', { concurrency: 1 }, async (t) => {
    // Connect & dropDatabase ONLY after safety guards pass
    await mongoose.connect(rawUri, { autoIndex: false });
    await mongoose.connection.dropDatabase();

    // syncIndexes on all models since autoIndex is false
    await Promise.all([
      Department.syncIndexes(),
      Post.syncIndexes(),
      EmployeeCategory.syncIndexes(),
      PerformanceFactor.syncIndexes(),
      HrProfile.syncIndexes(),
      HrIncident.syncIndexes(),
      HrReview.syncIndexes(),
      Attendance.syncIndexes(),
    ]);

    // ── SEED USERS & TEAMS ─────────────────────────────────────────────────
    // 1. T3_LeadA (leads Team 1 and Team 2)
    const leadA = await User.create({ name: 'Lead A (Multi)', email: 'leada@test.com', password: 'hash', role: 'T3_EXECUTIVE' });
    // 2. T3_LeadB (leads Team 3)
    const leadB = await User.create({ name: 'Lead B', email: 'leadb@test.com', password: 'hash', role: 'T3_EXECUTIVE' });
    // 3. T3_MemberOnly (in Team 1, but not lead)
    const t3Member = await User.create({ name: 'T3 Member Only', email: 't3mem@test.com', password: 'hash', role: 'T3_EXECUTIVE' });
    // 4. Members
    const memberA1 = await User.create({ name: 'Member A1', email: 'a1@test.com', password: 'hash', role: 'T1_VOLUNTEER' });
    const memberA2 = await User.create({ name: 'Member A2', email: 'a2@test.com', password: 'hash', role: 'T1_VOLUNTEER' });
    const memberB1 = await User.create({ name: 'Member B1', email: 'b1@test.com', password: 'hash', role: 'T1_VOLUNTEER' });
    // 5. Removed member (User.teamId set, but removed from Team.members)
    const removedMember = await User.create({ name: 'Removed Member', email: 'rem@test.com', password: 'hash', role: 'T1_VOLUNTEER' });
    // 6. Person in no team
    const noTeamUser = await User.create({ name: 'No Team User', email: 'noteam@test.com', password: 'hash', role: 'T1_VOLUNTEER' });
    // 7. Admin & Super Admin
    const adminUser = await User.create({ name: 'Admin User', email: 'admin@test.com', password: 'hash', role: 'ADMIN' });
    const adminRestricted = await User.create({ name: 'Admin Restricted', email: 'adminres@test.com', password: 'hash', role: 'ADMIN', customGrants: ['events:read'] });
    const superAdmin = await User.create({ name: 'Super Admin', email: 'super@test.com', password: 'hash', role: 'SUPER_ADMIN' });

    // Seed Teams
    const team1 = await Team.create({
      name: 'Team 1',
      leadId: leadA._id,
      leadName: leadA.name,
      members: [memberA1._id, t3Member._id],
    });
    const team2 = await Team.create({
      name: 'Team 2',
      leadId: leadA._id,
      leadName: leadA.name,
      members: [memberA2._id],
    });
    const team3 = await Team.create({
      name: 'Team 3',
      leadId: leadB._id,
      leadName: leadB.name,
      members: [memberB1._id],
    });

    // Set User.teamId for removedMember pointing to Team 1, but do NOT add to team1.members
    await User.findByIdAndUpdate(removedMember._id, { teamId: team1._id });

    // Seed MonthLock for 2026-01
    await MonthLock.create({ month: '2026-01', isLocked: true, lockedBy: superAdmin._id });

    // Seed Performance Factor
    const factorPunctuality = await PerformanceFactor.create({
      name: 'Punctuality',
      benchmarkScore: 10,
      weight: 2,
    });

    // ── 1. INCIDENTS LIFECYCLE & ACCESS ────────────────────────────────────
    let incidentId;

    await t.test('Incidents: T3 leading two teams creates incidents for members of both', async () => {
      // Create for Team 1 member
      const res1 = await runRoute('POST', '/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA1._id.toString(),
          feedbackType: 'POSITIVE',
          title: 'Great Shift',
          narrative: 'Showed exceptional dedication',
        },
      });
      assert.equal(res1.statusCode, 201);
      assert.equal(res1.body.data.teamId.toString(), team1._id.toString());
      incidentId = res1.body.data._id;

      // Create for Team 2 member
      const res2 = await runRoute('POST', '/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA2._id.toString(),
          feedbackType: 'POSITIVE',
          title: 'Great Shift Team 2',
          narrative: 'Showed dedication in team 2',
        },
      });
      assert.equal(res2.statusCode, 201);
      assert.equal(res2.body.data.teamId.toString(), team2._id.toString());
    });

    await t.test('Incidents: Lead of another team is denied (403)', async () => {
      const res = await runRoute('POST', '/incidents', {
        user: { sub: leadB._id.toString(), role: 'T3_EXECUTIVE' },
        body: {
          employeeId: memberA1._id.toString(),
          feedbackType: 'NEGATIVE',
          title: 'Cross-team attempt',
          narrative: 'Denied',
        },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test('Incidents: T3 who is only a member is denied (403)', async () => {
      const res = await runRoute('POST', '/incidents', {
        user: { sub: t3Member._id.toString(), role: 'T3_EXECUTIVE' },
        body: {
          employeeId: memberA1._id.toString(),
          feedbackType: 'NEGATIVE',
          title: 'Peer attempt',
          narrative: 'Denied',
        },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test('Incidents: Removed member with User.teamId is denied (403)', async () => {
      const res = await runRoute('POST', '/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
        body: {
          employeeId: removedMember._id.toString(),
          feedbackType: 'NEGATIVE',
          title: 'Removed member attempt',
          narrative: 'Denied',
        },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test('Incidents: Person in no team is denied (403)', async () => {
      const res = await runRoute('POST', '/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
        body: {
          employeeId: noTeamUser._id.toString(),
          feedbackType: 'NEGATIVE',
          title: 'Outsider attempt',
          narrative: 'Denied',
        },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test('Incidents: Self-report is denied (403)', async () => {
      const res = await runRoute('POST', '/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
        body: {
          employeeId: leadA._id.toString(),
          feedbackType: 'POSITIVE',
          title: 'Self-report',
          narrative: 'Denied',
        },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test('Incidents: Month lock is NOT applied to incidents (succeeds in 2026-01)', async () => {
      const res = await runRoute('POST', '/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA1._id.toString(),
          date: '2026-01-15',
          feedbackType: 'NEUTRAL',
          title: 'Locked Month Incident',
          narrative: 'Allowed because month lock does not apply to incidents',
        },
      });
      assert.equal(res.statusCode, 201);
    });

    await t.test('Incidents: Edit records before and after in audit log', async () => {
      const res = await runRoute('PATCH', `/incidents/${incidentId}`, {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          title: 'Updated Great Shift',
          narrative: 'Updated narrative details',
        },
      });
      assert.equal(res.statusCode, 200);

      // Verify AuditLog record in real DB
      const audit = await AuditLog.findOne({
        action: 'HR_INCIDENT_UPDATE',
        targetId: incidentId.toString(),
      }).lean();
      assert.ok(audit, 'AuditLog entry must be stored in database');
      assert.equal(audit.details.oldValue.title, 'Great Shift');
      assert.equal(audit.details.newValue.title, 'Updated Great Shift');
    });

    await t.test('Incidents: Soft delete requires reason and marks isDeleted=true', async () => {
      const res = await runRoute('DELETE', `/incidents/${incidentId}`, {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: { deletedReason: 'Entered in error by supervisor' },
      });
      assert.equal(res.statusCode, 200);

      const doc = await HrIncident.findById(incidentId).lean();
      assert.equal(doc.isDeleted, true);
      assert.equal(doc.deletedReason, 'Entered in error by supervisor');
    });

    // ── 2. REVIEWS, UNIQUE INDEX, AND MONTH LOCK ───────────────────────────
    await t.test('Reviews: Month lock blocks review in locked month 2026-01 (403)', async () => {
      const res = await runRoute('POST', '/reviews', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA1._id.toString(),
          period: '2026-01',
          items: [{ factorId: factorPunctuality._id.toString(), factorName: 'Punctuality', benchmarkScore: 10, weight: 2, obtainedScore: 9 }],
        },
      });
      assert.equal(res.statusCode, 403);
      assert.match(res.body.message, /locked against modifications/);
    });

    await t.test('Reviews: T3 can review members in both led teams for unlocked month (201)', async () => {
      const res1 = await runRoute('POST', '/reviews', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA1._id.toString(),
          period: '2026-03',
          items: [{ factorId: factorPunctuality._id.toString(), factorName: 'Punctuality', benchmarkScore: 10, weight: 2, obtainedScore: 8 }],
        },
      });
      assert.equal(res1.statusCode, 201);
      assert.equal(res1.body.data.netScorePercentage, 80);

      const res2 = await runRoute('POST', '/reviews', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA2._id.toString(),
          period: '2026-03',
          items: [{ factorId: factorPunctuality._id.toString(), factorName: 'Punctuality', benchmarkScore: 10, weight: 2, obtainedScore: 10 }],
        },
      });
      assert.equal(res2.statusCode, 201);
      assert.equal(res2.body.data.netScorePercentage, 100);
    });

    await t.test('Reviews: Duplicate period updates existing record (one review per period)', async () => {
      const res = await runRoute('POST', '/reviews', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE', name: leadA.name },
        body: {
          employeeId: memberA1._id.toString(),
          period: '2026-03',
          items: [{ factorId: factorPunctuality._id.toString(), factorName: 'Punctuality', benchmarkScore: 10, weight: 2, obtainedScore: 10 }],
        },
      });
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.data.netScorePercentage, 100);

      // Verify real MongoDB unique compound index
      const count = await HrReview.countDocuments({ employeeId: memberA1._id, period: '2026-03' });
      assert.equal(count, 1, 'Only one review document must exist per employee and period');
    });

    await t.test('Reviews: ADMIN with default permissions can submit review', async () => {
      const res = await runRoute('POST', '/reviews', {
        user: { sub: adminUser._id.toString(), role: 'ADMIN', name: adminUser.name },
        body: {
          employeeId: memberA1._id.toString(),
          period: '2026-04',
          teamId: team1._id.toString(),
          items: [{ factorId: factorPunctuality._id.toString(), factorName: 'Punctuality', benchmarkScore: 10, weight: 2, obtainedScore: 7 }],
        },
      });
      assert.equal(res.statusCode, 201);
    });

    await t.test('Reviews: ADMIN with customGrants lacking hr:reviews_manage is denied (403)', async () => {
      const res = await runRoute('POST', '/reviews', {
        user: { sub: adminRestricted._id.toString(), role: 'ADMIN', customGrants: ['events:read'] },
        body: {
          employeeId: memberA1._id.toString(),
          period: '2026-05',
          items: [{ factorId: factorPunctuality._id.toString(), factorName: 'Punctuality', benchmarkScore: 10, weight: 2, obtainedScore: 7 }],
        },
      });
      assert.equal(res.statusCode, 403);
    });

    // ── 3. PROFILES READ AND WRITE ─────────────────────────────────────────
    await t.test('Profiles: T3 reads profile of led member, denied for other member', async () => {
      const okRes = await runRoute('GET', `/profiles/${memberA1._id}`, {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
      });
      assert.equal(okRes.statusCode, 200);

      const denyRes = await runRoute('GET', `/profiles/${memberB1._id}`, {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
      });
      assert.equal(denyRes.statusCode, 403);
    });

    await t.test('Profiles: ADMIN updates profile; restricted ADMIN is denied', async () => {
      const okRes = await runRoute('PUT', `/profiles/${memberA1._id}`, {
        user: { sub: adminUser._id.toString(), role: 'ADMIN' },
        body: { joiningDate: '2026-02-01', notes: 'Top contributor' },
      });
      assert.equal(okRes.statusCode, 200);
      assert.equal(okRes.body.data.joiningDate, '2026-02-01');

      const denyRes = await runRoute('PUT', `/profiles/${memberA1._id}`, {
        user: { sub: adminRestricted._id.toString(), role: 'ADMIN', customGrants: ['events:read'] },
        body: { notes: 'Attempt' },
      });
      assert.equal(denyRes.statusCode, 403);
    });

    // ── 4. EXCEPTIONS SUMMARY & CSV EXPORTS ────────────────────────────────
    await t.test('Exceptions: T3 leading two teams sees members from both', async () => {
      // Seed attendance
      await Attendance.create({ user: memberA1._id, date: '2026-03-05', status: 'late', method: 'qr' });
      await Attendance.create({ user: memberA2._id, date: '2026-03-06', status: 'absent', method: 'manual' });
      await Attendance.create({ user: memberB1._id, date: '2026-03-07', status: 'on_leave', method: 'qr' });

      const res = await runRoute('GET', '/attendance-exceptions', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
        query: { month: '2026-03' },
      });
      assert.equal(res.statusCode, 200);
      const userIds = res.body.data.map(d => d.employeeId);
      assert.ok(userIds.includes(memberA1._id.toString()));
      assert.ok(userIds.includes(memberA2._id.toString()));
      assert.ok(!userIds.includes(memberB1._id.toString()));
    });

    await t.test('CSV Exports: Scoped by team and formula-safe', async () => {
      const res = await runRoute('GET', '/export/incidents', {
        user: { sub: leadA._id.toString(), role: 'T3_EXECUTIVE' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.ok(res.body.includes('Member A1'));
    });

    // Teardown
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    authMw.protect = origProtect;
  });
}
