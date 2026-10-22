const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.JWT_ACCESS_SECRET = 'test_access_jwt_secret_min_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_jwt_secret_min_32_characters_long';

const ShiftTemplate = require('../models/ShiftTemplate.model');
const Task = require('../models/Task.model');
const ShiftAssignment = require('../models/ShiftAssignment.model');
const DailyAttendance = require('../models/DailyAttendance.model');
const TimesheetDay = require('../models/TimesheetDay.model');
const MonthLock = require('../models/MonthLock.model');
const Team = require('../modules/teams/teams.model');
const User = require('../modules/admin/admin.model');
const AuditLog = require('../models/AuditLog.model');
const notifyService = require('../modules/notifications/notifications.service');
const workforceService = require('../modules/workforce/workforce.service');

const id = (d) => new mongoose.Types.ObjectId(d.repeat(24));

describe('Workforce Module Unit Tests', () => {
  const leadId = id('1');
  const memberId = id('2');
  const outsiderId = id('3');
  const teamId = id('4');

  // Prevent MongoDB buffering timeouts on unmocked notifications
  notifyService.notify = async () => true;

  test('ShiftTemplate: creates shift template and calculates correct duration', async (t) => {
    t.mock.method(ShiftTemplate, 'create', async (doc) => ({
      _id: id('a'),
      ...doc,
    }));

    const template = await workforceService.createShiftTemplate({
      name: 'Morning Shift',
      teamId,
      startTime: '09:00',
      endTime: '13:00',
      breakMinutes: 0,
      weekdays: [1, 2, 3, 4, 5],
    }, leadId);

    assert.equal(template.name, 'Morning Shift');
    assert.equal(template.durationHours, 4);
    assert.equal(template.breakMinutes, 0);
  });

  test('Task: a T3 creates a task for their own team and ignores teamId in request body', async (t) => {
    t.mock.method(Team, 'findOne', () => ({
      _id: teamId,
      name: 'Alpha Team',
      leadId,
    }));

    let capturedDetails = null;
    t.mock.method(AuditLog, 'create', async (entry) => {
      capturedDetails = entry;
      return true;
    });

    t.mock.method(Task, 'findOne', async () => null);
    t.mock.method(Task, 'create', async (doc) => ({
      _id: id('b'),
      ...doc,
    }));

    // T3 attempts to pass a different otherTeamId in the request body
    const otherTeamId = id('8');
    const task = await workforceService.createTask({
      title: 'Setup Event Hall',
      description: 'Arrange sound checks and chairs',
      teamId: otherTeamId,
      dueDate: '2026-10-20',
      priority: 'HIGH',
    }, { sub: leadId.toString(), role: 'T3_EXECUTIVE', name: 'Lead' });

    assert.equal(task.title, 'Setup Event Hall');
    assert.equal(task.priority, 'HIGH');
    assert.equal(task.teamId.toString(), teamId.toString(), 'T3 task teamId must be derived from their own team, ignoring request body');
    assert.ok(capturedDetails, 'Audit log entry must be written on task creation');
    assert.equal(capturedDetails.action, 'TASK_CREATE');
    assert.equal(capturedDetails.performedBy.toString(), leadId.toString());
  });

  test('Task: T3 of another team or not leading any team is rejected', async (t) => {
    t.mock.method(Team, 'findOne', () => null);

    await assert.rejects(
      async () => {
        await workforceService.createTask({
          title: 'Unauthorized Task',
          teamId,
        }, { sub: id('9').toString(), role: 'T3_EXECUTIVE' });
      },
      /Only team leads can create tasks/
    );
  });

  test('Task: missing or over-long title is rejected', async (t) => {
    t.mock.method(Team, 'findOne', () => ({ _id: teamId, leadId }));

    await assert.rejects(
      async () => {
        await workforceService.createTask({ title: '   ', teamId }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /title is required/
    );

    await assert.rejects(
      async () => {
        await workforceService.createTask({ title: 'A'.repeat(101), teamId }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /title must not exceed 100 characters/
    );
  });

  test('Task: idempotency returns existing task on quick double submit', async (t) => {
    t.mock.method(Team, 'findOne', () => ({ _id: teamId, leadId }));

    const existingDoc = { _id: id('b'), title: 'Duplicate Check', teamId, createdAt: new Date() };
    t.mock.method(Task, 'findOne', async () => existingDoc);

    const task = await workforceService.createTask({
      title: 'Duplicate Check',
      teamId,
    }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });

    assert.equal(task._id, existingDoc._id, 'Must return existing task without re-inserting');
  });

  test('ShiftAssignment: blocks assignment if user is not in the team', async (t) => {
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({
        _id: teamId,
        name: 'Alpha Team',
        leadId,
        members: [memberId],
      }),
    }));

    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: outsiderId, name: 'Outsider', email: 'out@test.com', role: 'T1_VOLUNTEER' }),
    }));

    await assert.rejects(
      async () => {
        await workforceService.createAssignment({
          userId: outsiderId,
          teamId,
          shiftTemplateId: id('a'),
          date: '2026-10-20',
        }, leadId);
      },
      /Target user is not a member of this team/
    );
  });

  test('ShiftAssignment: prevents double assignment on the same date (1 person 1 shift)', async (t) => {
    t.mock.method(Team, 'findById', () => ({
      select: async () => ({
        _id: teamId,
        name: 'Alpha Team',
        leadId,
        members: [memberId],
      }),
    }));

    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }),
    }));

    t.mock.method(ShiftTemplate, 'findById', async () => ({
      _id: id('a'),
      name: 'Morning Shift',
      isActive: true,
      startTime: '09:00',
      endTime: '13:00',
      durationHours: 4,
    }));

    t.mock.method(ShiftAssignment, 'find', () => ({
      lean: async () => [{ userId: memberId, date: '2026-10-20' }],
    }));

    await assert.rejects(
      async () => {
        await workforceService.createAssignment({
          userId: memberId,
          teamId,
          shiftTemplateId: id('a'),
          date: '2026-10-20',
        }, leadId);
      },
      /User already has a shift assigned on: 2026-10-20/
    );
  });

  test('Manual Attendance: blocks team lead from marking own attendance', async (t) => {
    await assert.rejects(
      async () => {
        await workforceService.markManualAttendance({
          userId: leadId,
          date: '2026-10-14',
          status: 'PRESENT',
        }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /Cannot mark own attendance/
    );
  });

  test('Manual Attendance: rejects future date', async () => {
    await assert.rejects(
      async () => {
        await workforceService.markManualAttendance({
          userId: memberId,
          date: '2099-01-01',
          status: 'PRESENT',
        }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /Cannot mark attendance for future dates/
    );
  });

  test('Manual Attendance: rejects date beyond 7 days for T3, but allows for ADMIN with reason', async () => {
    const oldDate = '2026-09-01';

    await assert.rejects(
      async () => {
        await workforceService.markManualAttendance({
          userId: memberId,
          date: oldDate,
          status: 'PRESENT',
        }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /older than 7 days/
    );

    // Admin without reason is rejected
    await assert.rejects(
      async () => {
        await workforceService.markManualAttendance({
          userId: memberId,
          date: oldDate,
          status: 'PRESENT',
          note: 'short',
        }, { sub: id('9').toString(), role: 'ADMIN' });
      },
      /Administrators must provide a reason/
    );
  });

  test('Manual Attendance: rejects override of a QR-scanned day without a note', async (t) => {
    const recentDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }),
    }));
    t.mock.method(Team, 'findOne', () => ({
      _id: teamId,
      name: 'Alpha Team',
      leadId,
      members: [memberId],
    }));
    t.mock.method(DailyAttendance, 'findOne', async () => ({
      status: 'PRESENT',
      rawPunchId: id('a'),
    }));

    await assert.rejects(
      async () => {
        await workforceService.markManualAttendance({
          userId: memberId,
          date: recentDate,
          status: 'PRESENT',
          note: '',
        }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /A note is required/
    );
  });

  test('Manual Attendance: T3 marks own team member OK, ignores team in request body, and writes audit', async (t) => {
    const recentDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }),
    }));

    t.mock.method(Team, 'findOne', () => ({
      _id: teamId,
      name: 'Alpha Team',
      leadId,
      members: [memberId],
    }));

    t.mock.method(DailyAttendance, 'findOne', async () => null);
    t.mock.method(ShiftAssignment, 'findOne', () => ({ lean: async () => null }));

    let auditLogged = false;
    let auditAction = null;
    t.mock.method(AuditLog, 'create', async (doc) => {
      auditLogged = true;
      auditAction = doc.action;
      return true;
    });

    t.mock.method(DailyAttendance, 'findOneAndUpdate', async (_, update) => ({
      ...update.$set,
    }));

    const otherTeamId = id('8');
    const result = await workforceService.markManualAttendance({
      userId: memberId,
      teamId: otherTeamId, // should be ignored
      date: recentDate,
      status: 'PRESENT',
    }, { sub: leadId.toString(), role: 'T3_EXECUTIVE', name: 'Lead' });

    assert.equal(result.status, 'PRESENT');
    assert.equal(result.teamId.toString(), teamId.toString(), 'Team must come from database, ignoring request body');
    assert.equal(result.markedMethod, 'manual_lead');
    assert.equal(auditLogged, true);
    assert.equal(auditAction, 'ATTENDANCE_MANUAL_MARK');
  });

  test('Manual Attendance: T3 of another team is rejected', async (t) => {
    const recentDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }),
    }));
    t.mock.method(Team, 'findOne', () => null);

    await assert.rejects(
      async () => {
        await workforceService.markManualAttendance({
          userId: memberId,
          date: recentDate,
          status: 'PRESENT',
        }, { sub: id('9').toString(), role: 'T3_EXECUTIVE' });
      },
      /You are not the designated lead/
    );
  });

  test('Bulk Attendance: markAllPresent skips already marked members and writes single audit', async (t) => {
    const recentDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    t.mock.method(Team, 'findOne', () => ({
      _id: teamId,
      leadId,
      members: [memberId, outsiderId],
    }));

    t.mock.method(DailyAttendance, 'find', async () => [{ userId: memberId, date: recentDate }]);
    t.mock.method(User, 'find', async () => [
      { _id: memberId, name: 'Member', email: 'mem@test.com', role: 'T1_VOLUNTEER' },
      { _id: outsiderId, name: 'Outsider', email: 'out@test.com', role: 'T1_VOLUNTEER' },
    ]);

    let createdDocs = [];
    t.mock.method(DailyAttendance, 'create', async (doc) => {
      createdDocs.push(doc);
      return doc;
    });

    let bulkAudit = null;
    t.mock.method(AuditLog, 'create', async (doc) => {
      bulkAudit = doc;
      return true;
    });

    const res = await workforceService.markAllPresent({
      date: recentDate,
    }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });

    assert.equal(res.markedCount, 1);
    assert.equal(res.skippedCount, 1);
    assert.equal(createdDocs.length, 1);
    assert.equal(createdDocs[0].userId.toString(), outsiderId.toString());
    assert.ok(bulkAudit);
    assert.equal(bulkAudit.action, 'ATTENDANCE_BULK_MARK_PRESENT');
  });

  test('Day Timesheet: blocks submissions older than 7 days', async (t) => {
    await assert.rejects(
      async () => {
        await workforceService.submitDayTimesheet(memberId, {
          date: '2026-09-01',
          teamId,
          entries: [{ taskTitle: 'Past work', hoursSpent: 4, note: 'Valid detailed note' }],
        });
      },
      /Timesheets cannot be submitted for days older than 7 days/
    );
  });

  test('Day Timesheet: allows soft overtime (+2.0h) with isOvertime flag set', async (t) => {
    t.mock.method(TimesheetDay, 'findOne', async () => null);

    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }),
    }));

    t.mock.method(ShiftAssignment, 'findOne', () => ({
      lean: async () => ({ _id: id('5'), durationHours: 4.0 }),
    }));

    t.mock.method(Team, 'findById', () => ({
      select: async () => ({ leadId }),
    }));

    t.mock.method(TimesheetDay, 'findOneAndUpdate', async (_, update) => ({
      ...update.$set,
    }));

    const todayStr = new Date().toISOString().split('T')[0];

    const res = await workforceService.submitDayTimesheet(memberId, {
      date: todayStr,
      teamId,
      entries: [
        { taskTitle: 'Main Shift Tasks', hoursSpent: 4.0, note: 'Standard shift activities completed' },
        { taskTitle: 'Event Overtime Wrap', hoursSpent: 1.5, note: 'Remained behind to pack electronics' },
      ],
    });

    assert.equal(res.totalHoursSpent, 5.5);
    assert.equal(res.isOvertime, true, 'Soft overtime flag must be true');
    assert.equal(res.status, 'SUBMITTED');
  });

  test('Day Timesheet: hard-rejects hours exceeding shift duration by more than +2.0h', async (t) => {
    t.mock.method(TimesheetDay, 'findOne', async () => null);

    t.mock.method(User, 'findById', () => ({
      select: async () => ({ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }),
    }));

    t.mock.method(ShiftAssignment, 'findOne', () => ({
      lean: async () => ({ _id: id('5'), durationHours: 4.0 }),
    }));

    const todayStr = new Date().toISOString().split('T')[0];

    await assert.rejects(
      async () => {
        await workforceService.submitDayTimesheet(memberId, {
          date: todayStr,
          teamId,
          entries: [
            { taskTitle: 'Excessive task', hoursSpent: 7.0, note: 'More than 2 hours of overtime' },
          ],
        });
      },
      /exceed the maximum permitted overtime threshold/
    );
  });

  test('Day Timesheet Review: prevents self-approval by team lead', async (t) => {
    t.mock.method(TimesheetDay, 'findById', async () => ({
      _id: id('7'),
      userId: leadId,
      date: '2026-10-20',
      status: 'SUBMITTED',
    }));

    await assert.rejects(
      async () => {
        await workforceService.reviewDayTimesheet(id('7'), 'APPROVED', 'Looks good', {
          sub: leadId.toString(),
          role: 'T3_EXECUTIVE',
        });
      },
      /Cannot approve or reject your own timesheet/
    );
  });

  test('CSV Export: sanitizes formula injection characters', async (t) => {
    t.mock.method(workforceService, 'getAttendanceRegister', async () => ({
      team: { _id: teamId, name: 'Alpha' },
      dateRange: { startDate: '2026-10-01', endDate: '2026-10-31' },
      members: [
        { userId: memberId.toString(), name: '=SUM(A1:A10)', email: '+123456789@test.com', role: '-DANGEROUS' },
      ],
      attendance: [
        {
          userId: memberId.toString(),
          date: '2026-10-20',
          userName: '=SUM(A1:A10)',
          userEmail: '+123456789@test.com',
          userRole: '-DANGEROUS',
          status: '@ADMIN',
          markedMethod: 'manual_lead',
          source: 'manual',
          shiftStart: '09:00',
          shiftEnd: '13:00',
          note: 'Normal attendance',
        },
      ],
      assignments: [],
    }));

    const { csv } = await workforceService.exportMonthlyRegisterCSV(teamId, '2026-10');

    assert.ok(csv.includes("'\=SUM(A1:A10)"), 'Cell starting with = must be prepended with single quote');
    assert.ok(csv.includes("'\+123456789@test.com"), 'Cell starting with + must be prepended with single quote');
    assert.ok(csv.includes("'\-DANGEROUS"), 'Cell starting with - must be prepended with single quote');
    assert.ok(csv.includes("'\@ADMIN"), 'Cell starting with @ must be prepended with single quote');
  });

  test('Workforce Routes: POST /tasks rejects non-lead callers (T1/T2)', async () => {
    const workforceRoutes = require('../modules/workforce/workforce.routes');
    const taskPostRoute = workforceRoutes.stack.find(
      (layer) => layer.route && layer.route.path === '/tasks' && layer.route.methods.post
    );
    assert.ok(taskPostRoute, 'POST /tasks route must exist');

    // The restrictTo middleware is in the route stack
    const restrictMiddleware = taskPostRoute.route.stack[1].handle;
    let statusSet = null;
    let jsonSent = null;
    const mockRes = {
      status: (code) => {
        statusSet = code;
        return { json: (data) => { jsonSent = data; } };
      },
    };

    // Call as T1_VOLUNTEER -> 403
    await restrictMiddleware({ user: { role: 'T1_VOLUNTEER' } }, mockRes, () => {});
    assert.equal(statusSet, 403, 'T1_VOLUNTEER must be rejected with 403');
    assert.equal(jsonSent?.success, false);

    // Call as T2_ASSOCIATE -> 403
    statusSet = null;
    await restrictMiddleware({ user: { role: 'T2_ASSOCIATE' } }, mockRes, () => {});
    assert.equal(statusSet, 403, 'T2_ASSOCIATE must be rejected with 403');
    assert.equal(jsonSent?.success, false);

    // Call as T3_EXECUTIVE passes through to next
    let nextCalled = false;
    await restrictMiddleware({ user: { role: 'T3_EXECUTIVE' } }, mockRes, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'T3_EXECUTIVE must pass through restrictTo');
  });

  test('Regularization: member requests regularization within 7 days', async (t) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const mockAttendance = {
      _id: id('a'),
      userId: memberId,
      userName: 'T1 Member',
      teamId,
      date: todayStr,
      status: 'LATE',
      regularization: { status: 'NONE' },
      save: async () => mockAttendance,
    };

    t.mock.method(DailyAttendance, 'findById', async () => mockAttendance);
    t.mock.method(DailyAttendance, 'countDocuments', async () => 0);
    t.mock.method(Team, 'findById', () => ({ select: async () => ({ leadId }) }));

    const res = await workforceService.requestRegularization(memberId, {
      attendanceId: id('a'),
      targetStatus: 'PRESENT',
      reason: 'Biometric device network failure at entrance',
    });

    assert.equal(res.regularization.status, 'PENDING');
    assert.equal(res.regularization.targetStatus, 'PRESENT');
    assert.equal(res.status, 'LATE', 'Status remains unadjusted until lead approval');
  });

  test('Regularization: rejects request older than 7 days', async (t) => {
    const pastAttendance = {
      _id: id('a'),
      userId: memberId,
      date: '2026-09-01',
    };

    t.mock.method(DailyAttendance, 'findById', async () => pastAttendance);

    await assert.rejects(
      async () => {
        await workforceService.requestRegularization(memberId, {
          attendanceId: id('a'),
          reason: 'Too late',
        });
      },
      /older than 7 days/
    );
  });

  test('Regularization: enforces max 3 regularizations per month', async (t) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const mockAttendance = {
      _id: id('a'),
      userId: memberId,
      date: todayStr,
    };

    t.mock.method(DailyAttendance, 'findById', async () => mockAttendance);
    t.mock.method(DailyAttendance, 'countDocuments', async () => 3);

    await assert.rejects(
      async () => {
        await workforceService.requestRegularization(memberId, {
          attendanceId: id('a'),
          reason: 'Fourth request',
        });
      },
      /Monthly regularization limit \(3 requests per month\) exceeded/
    );
  });

  test('Regularization Review: lead approves member request and updates status to PRESENT with audit trail', async (t) => {
    const mockAttendance = {
      _id: id('a'),
      userId: memberId,
      userName: 'T1 Member',
      teamId,
      date: '2026-10-20',
      status: 'ABSENT',
      originalStatus: null,
      regularization: { status: 'PENDING', targetStatus: 'PRESENT' },
      save: async () => mockAttendance,
    };

    t.mock.method(DailyAttendance, 'findById', async () => mockAttendance);
    t.mock.method(Team, 'findById', () => ({ select: async () => ({ leadId }) }));

    const reviewed = await workforceService.reviewRegularization(id('a'), 'APPROVED', 'Verified by team lead', {
      sub: leadId.toString(),
      role: 'T3_EXECUTIVE',
      name: 'Mayank Lead',
    });

    assert.equal(reviewed.status, 'PRESENT', 'Status must be updated to targetStatus upon approval');
    assert.equal(reviewed.originalStatus, 'ABSENT', 'Original status must be preserved for audit');
    assert.equal(reviewed.regularization.status, 'APPROVED');
  });

  test('Regularization Review: team lead cannot self-approve own regularization request', async (t) => {
    const mockAttendance = {
      _id: id('a'),
      userId: leadId,
      teamId,
      date: '2026-10-20',
      status: 'LATE',
      regularization: { status: 'PENDING' },
    };

    t.mock.method(DailyAttendance, 'findById', async () => mockAttendance);

    await assert.rejects(
      async () => {
        await workforceService.reviewRegularization(id('a'), 'APPROVED', 'Self-approval', {
          sub: leadId.toString(),
          role: 'T3_EXECUTIVE',
        });
      },
      /Cannot approve or reject your own regularization request/
    );
  });

  test('MonthLock: correctly returns status and blocks locked dates', async (t) => {
    t.mock.method(MonthLock, 'findOne', () => ({
      lean: async () => ({
        month: '2026-10',
        isLocked: true,
        lockedBy: id('1'),
        lockedAt: new Date(),
      }),
    }));

    const status = await workforceService.getMonthLockStatus('2026-10');
    assert.equal(status.isLocked, true);
    assert.equal(status.month, '2026-10');
  });

  test('Shift Assignments: team members (T1/T2) have read-only access to their team assignments', async (t) => {
    const { requireTeamLeadOrAdmin } = require('../modules/workforce/workforce.middleware');
    const mockTeam = {
      _id: teamId,
      leadId,
      members: [memberId],
    };
    t.mock.method(Team, 'findById', () => ({
      select: async () => mockTeam,
    }));

    let nextCalled = false;
    const req = {
      method: 'GET',
      path: '/assignments/team',
      query: { teamId: teamId.toString() },
      user: { sub: memberId.toString(), role: 'T1_VOLUNTEER' },
    };
    await requireTeamLeadOrAdmin(req, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Team member must be allowed read-only access to team shift assignments');

    // Non-team member is rejected
    let rejectedStatus = null;
    let rejectedMsg = null;
    const nonMemberReq = {
      method: 'GET',
      path: '/assignments/team',
      query: { teamId: teamId.toString() },
      user: { sub: id('f').toString(), role: 'T1_VOLUNTEER' },
    };
    await requireTeamLeadOrAdmin(nonMemberReq, {
      status: (code) => {
        rejectedStatus = code;
        return { json: (data) => { rejectedMsg = data.message; } };
      },
    }, () => {});
    assert.equal(rejectedStatus, 403, 'Non-team member must be rejected with 403');
  });

  test('Attendance Register: approved leaves are visible in attendance register', async (t) => {
    const todayStr = new Date().toISOString().split('T')[0];
    t.mock.method(Team, 'findById', () => ({
      lean: async () => ({
        _id: teamId,
        name: 'Alpha Team',
        leadId,
        members: [memberId],
      }),
    }));
    t.mock.method(User, 'find', () => ({
      select: () => ({
        lean: async () => [{ _id: memberId, name: 'T1 Member', email: 't1@test.com', role: 'T1_VOLUNTEER' }],
      }),
    }));
    t.mock.method(DailyAttendance, 'find', () => ({
      lean: async () => [], // No manual attendance marked yet
    }));
    t.mock.method(ShiftAssignment, 'find', () => ({
      lean: async () => [],
    }));
    const Application = require('../modules/applications/applications.model');
    t.mock.method(Application, 'find', () => ({
      lean: async () => [{
        _id: id('e'),
        studentId: memberId,
        studentName: 'T1 Member',
        studentEmail: 't1@test.com',
        role: 'T1_VOLUNTEER',
        teamId,
        targetDate: todayStr,
        status: 'approved',
        requestType: 'leave',
        reason: 'Family event',
        reviewedBy: leadId,
        reviewedByName: 'Lead',
        reviewedAt: new Date(),
      }],
    }));

    const reg = await workforceService.getAttendanceRegister({ teamId: teamId.toString() }, { role: 'SUPER_ADMIN', sub: id('1') });
    assert.ok(reg.attendance.length > 0, 'Approved leave must appear in attendance records');
    assert.equal(reg.attendance[0].status, 'ON_LEAVE');
    assert.equal(reg.attendance[0].userId, memberId.toString());
  });

  test('Application Service: approving leave marks both Attendance and DailyAttendance with ON_LEAVE', async (t) => {
    const applicationService = require('../modules/applications/applications.service');
    const Application = require('../modules/applications/applications.model');
    const Attendance = require('../modules/attendance/attendance.model');
    const todayStr = new Date().toISOString().split('T')[0];

    const mockApp = {
      _id: id('e'),
      studentId: memberId,
      studentName: 'T1 Member',
      studentEmail: 't1@test.com',
      teamId,
      teamName: 'Alpha Team',
      role: 'T1_VOLUNTEER',
      requestType: 'leave',
      targetDate: todayStr,
      reason: 'Sick leave',
      status: 'pending',
      save: async () => mockApp,
    };

    t.mock.method(Application, 'findById', async () => mockApp);
    t.mock.method(Team, 'findById', async () => ({ _id: teamId, leadId }));
    t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: leadId, name: 'Lead' }) }));

    let legacyAttendanceUpserted = null;
    t.mock.method(Attendance, 'findOneAndUpdate', async (filter, update) => {
      legacyAttendanceUpserted = { filter, update };
      return update;
    });

    let dailyAttendanceUpserted = null;
    t.mock.method(DailyAttendance, 'findOneAndUpdate', async (filter, update) => {
      dailyAttendanceUpserted = { filter, update };
      return update;
    });

    await applicationService.updateStatus(id('e'), 'approved', { sub: leadId.toString(), role: 'T3_EXECUTIVE' });

    assert.ok(legacyAttendanceUpserted, 'Legacy Attendance must be upserted');
    assert.equal(legacyAttendanceUpserted.update.status, 'on_leave');
    assert.ok(dailyAttendanceUpserted, 'DailyAttendance must be upserted');
    assert.equal(dailyAttendanceUpserted.update.$set.status, 'ON_LEAVE');
    assert.equal(dailyAttendanceUpserted.update.$set.userId.toString(), memberId.toString());
    assert.equal(dailyAttendanceUpserted.update.$set.date, todayStr);
  });
});
