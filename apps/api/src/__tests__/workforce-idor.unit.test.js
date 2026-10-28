const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const workforceService = require('../modules/workforce/workforce.service');
const ShiftAssignment = require('../models/ShiftAssignment.model');
const DailyAttendance = require('../models/DailyAttendance.model');
const Team = require('../modules/teams/teams.model');

test('Workforce Shift Assignment BOLA / IDOR Protection', async (t) => {
  const origShiftFindById = ShiftAssignment.findById;
  const origShiftFindByIdAndDelete = ShiftAssignment.findByIdAndDelete;
  const origDailyAttendanceExists = DailyAttendance.exists;
  const origTeamFindById = Team.findById;

  t.afterEach(() => {
    ShiftAssignment.findById = origShiftFindById;
    ShiftAssignment.findByIdAndDelete = origShiftFindByIdAndDelete;
    DailyAttendance.exists = origDailyAttendanceExists;
    Team.findById = origTeamFindById;
  });

  await t.test('deleteAssignment blocks team lead from deleting a shift for a team they do not lead', async () => {
    const shiftId = new mongoose.Types.ObjectId().toString();
    const teamBId = new mongoose.Types.ObjectId().toString();
    const leadAId = new mongoose.Types.ObjectId().toString();

    const mockAssignment = {
      _id: shiftId,
      teamId: teamBId,
      userId: new mongoose.Types.ObjectId().toString(),
      date: '2026-10-25',
    };

    ShiftAssignment.findById = async () => mockAssignment;
    DailyAttendance.exists = async () => false;

    // Team B is led by someone else (not leadAId)
    Team.findById = async (id) => ({
      _id: teamBId,
      leadId: new mongoose.Types.ObjectId().toString(),
    });

    const requester = {
      sub: leadAId,
      role: 'T3_EXECUTIVE',
    };

    await assert.rejects(
      async () => {
        await workforceService.deleteAssignment(shiftId, requester);
      },
      {
        message: 'Access denied: You can only delete shifts for teams you lead.',
      }
    );
  });

  await t.test('deleteAssignment allows designated team lead to delete their team shift', async () => {
    const shiftId = new mongoose.Types.ObjectId().toString();
    const teamAId = new mongoose.Types.ObjectId().toString();
    const leadAId = new mongoose.Types.ObjectId().toString();

    let deleted = false;
    const mockAssignment = {
      _id: shiftId,
      teamId: teamAId,
      userId: new mongoose.Types.ObjectId().toString(),
      date: '2026-10-25',
    };

    ShiftAssignment.findById = async () => mockAssignment;
    DailyAttendance.exists = async () => false;
    ShiftAssignment.findByIdAndDelete = async () => { deleted = true; };

    Team.findById = async () => ({
      _id: teamAId,
      leadId: leadAId,
    });

    const requester = {
      sub: leadAId,
      role: 'T3_EXECUTIVE',
    };

    const result = await workforceService.deleteAssignment(shiftId, requester);
    assert.strictEqual(result.success, true);
    assert.strictEqual(deleted, true);
  });
});
