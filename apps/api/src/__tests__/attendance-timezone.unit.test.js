const { test } = require('node:test');
const assert = require('node:assert/strict');
const attendanceService = require('../modules/attendance/attendance.service');
const Team = require('../modules/teams/teams.model');
const User = require('../modules/admin/admin.model');
const Attendance = require('../modules/attendance/attendance.model');
const mongoose = require('mongoose');

test('Attendance timezone consistency', async (t) => {
  const origTeamFindById = Team.findById;
  const origUserFindById = User.findById;
  const origAttendanceFindOneAndUpdate = Attendance.findOneAndUpdate;
  const origAttendanceFindOne = Attendance.findOne;
  const origDate = global.Date;

  t.afterEach(() => {
    Team.findById = origTeamFindById;
    User.findById = origUserFindById;
    Attendance.findOneAndUpdate = origAttendanceFindOneAndUpdate;
    Attendance.findOne = origAttendanceFindOne;
    global.Date = origDate;
  });

  await t.test('selfCheckIn records date in Asia/Kolkata timezone, not UTC', async () => {
    // 21:00 UTC on 2026-10-25 is 02:30 IST on 2026-10-26
    const mockNow = new origDate('2026-10-25T21:00:00.000Z');

    class MockDate extends origDate {
      constructor(...args) {
        if (args.length === 0) {
          super(mockNow.getTime());
        } else {
          super(...args);
        }
      }
      static now() {
        return mockNow.getTime();
      }
    }
    global.Date = MockDate;

    const userId = new mongoose.Types.ObjectId().toString();
    const teamId = new mongoose.Types.ObjectId().toString();

    Team.findById = async () => ({
      _id: teamId,
      name: 'Alpha Team',
      members: [userId],
    });

    User.findById = () => ({
      select: () => ({ name: 'Test User', email: 'test@example.com' }),
    });

    Attendance.findOne = async () => null;

    let upsertedDate = null;
    Attendance.findOneAndUpdate = async (filter, update) => {
      upsertedDate = filter.date;
      return { ...update, _id: new mongoose.Types.ObjectId() };
    };

    await attendanceService.selfCheckIn({ sub: userId }, { teamId });

    // In IST it is already 2026-10-26. UTC is 2026-10-25.
    assert.strictEqual(
      upsertedDate,
      '2026-10-26',
      'Attendance date must be in Asia/Kolkata (IST), matching attendanceLink date'
    );
  });
});
