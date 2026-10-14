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

  test('Task: creates team task', async (t) => {
    t.mock.method(Task, 'create', async (doc) => ({
      _id: id('b'),
      ...doc,
    }));

    const task = await workforceService.createTask({
      title: 'Setup Event Hall',
      description: 'Arrange sound checks and chairs',
      teamId,
      dueDate: '2026-10-20',
      priority: 'HIGH',
    }, leadId);

    assert.equal(task.title, 'Setup Event Hall');
    assert.equal(task.priority, 'HIGH');
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
          teamId,
          date: '2026-10-20',
          status: 'PRESENT',
        }, { sub: leadId.toString(), role: 'T3_EXECUTIVE' });
      },
      /Cannot mark own attendance/
    );
  });

  test('Manual Attendance: successfully marks attendance for team member and records audit when overriding', async (t) => {
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

    t.mock.method(ShiftAssignment, 'findOne', () => ({
      lean: async () => ({ _id: id('5'), startTime: '09:00', endTime: '13:00' }),
    }));

    let auditLogged = false;
    t.mock.method(AuditLog, 'create', async () => {
      auditLogged = true;
      return true;
    });

    t.mock.method(DailyAttendance, 'findOne', async () => ({
      status: 'LATE',
      rawPunchId: id('6'),
    }));

    t.mock.method(DailyAttendance, 'findOneAndUpdate', async (_, update) => ({
      ...update.$set,
    }));

    const result = await workforceService.markManualAttendance({
      userId: memberId,
      teamId,
      date: '2026-10-20',
      status: 'PRESENT',
      reason: 'Verified manual arrival at venue on time',
    }, { sub: leadId.toString(), role: 'T3_EXECUTIVE', name: 'Lead' });

    assert.equal(result.status, 'PRESENT');
    assert.equal(result.markedMethod, 'manual_lead');
    assert.equal(auditLogged, true, 'Audit log must be created when overriding raw punch');
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
    t.mock.method(workforceService, 'getAttendanceRegister', async () => [
      {
        date: '2026-10-20',
        userName: '=SUM(A1:A10)',
        userEmail: '+123456789@test.com',
        userRole: '-DANGEROUS',
        status: '@ADMIN',
        markedMethod: 'manual_lead',
        shiftStart: '09:00',
        shiftEnd: '13:00',
        manualEntry: { markedByName: 'Lead', reason: 'Normal attendance' },
      },
    ]);

    const { csv } = await workforceService.exportMonthlyRegisterCSV(teamId, '2026-10');

    assert.ok(csv.includes("'\=SUM(A1:A10)"), 'Cell starting with = must be prepended with single quote');
    assert.ok(csv.includes("'\+123456789@test.com"), 'Cell starting with + must be prepended with single quote');
    assert.ok(csv.includes("'\-DANGEROUS"), 'Cell starting with - must be prepended with single quote');
    assert.ok(csv.includes("'\@ADMIN"), 'Cell starting with @ must be prepended with single quote');
  });
});
