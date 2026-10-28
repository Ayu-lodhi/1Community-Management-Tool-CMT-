const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const Timesheet = require('../modules/timesheets/timesheets.model');
const Team = require('../modules/teams/teams.model');
const User = require('../modules/admin/admin.model');
const timesheetService = require('../modules/timesheets/timesheets.service');

test('Timesheet Service Unit Tests', async (t) => {
  const origFindById = Timesheet.findById;
  const origTeamFindById = Team.findById;
  const origUserFindById = User.findById;

  beforeEach(() => {
    User.findById = () => ({
      select: () => ({ email: 'test@example.com', notificationPrefs: { inApp: false, email: false } }),
    });
  });

  afterEach(() => {
    Timesheet.findById = origFindById;
    Team.findById = origTeamFindById;
    User.findById = origUserFindById;
  });

  await t.test('updateStatus blocks team lead from approving own timesheet', async () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const teamId = new mongoose.Types.ObjectId().toString();
    const tsId = new mongoose.Types.ObjectId().toString();

    const mockTimesheet = {
      _id: tsId,
      userId: leadId, // Timesheet belongs to the lead
      teamId: teamId,
      status: 'submitted',
      save: async () => {},
    };

    const mockTeam = {
      _id: teamId,
      leadId: leadId,
      members: [leadId],
    };

    Timesheet.findById = async (id) => (id.toString() === tsId ? mockTimesheet : null);
    Team.findById = async (id) => (id.toString() === teamId ? mockTeam : null);

    const requester = {
      sub: leadId,
      role: 'T3_EXECUTIVE',
      name: 'Lead User',
    };

    await assert.rejects(
      async () => {
        await timesheetService.updateStatus(tsId, 'approved', requester);
      },
      {
        message: 'Self-approval is not permitted. An administrator must review your timesheet.',
      }
    );
  });

  await t.test('updateStatus allows admin or different team lead to approve member timesheet', async () => {
    const memberId = new mongoose.Types.ObjectId().toString();
    const leadId = new mongoose.Types.ObjectId().toString();
    const teamId = new mongoose.Types.ObjectId().toString();
    const tsId = new mongoose.Types.ObjectId().toString();

    let saved = false;
    const mockTimesheet = {
      _id: tsId,
      userId: memberId,
      teamId: teamId,
      status: 'submitted',
      date: '2026-10-25',
      save: async () => { saved = true; },
    };

    const mockTeam = {
      _id: teamId,
      leadId: leadId,
      members: [memberId, leadId],
    };

    Timesheet.findById = async (id) => (id.toString() === tsId ? mockTimesheet : null);
    Team.findById = async (id) => (id.toString() === teamId ? mockTeam : null);

    const requester = {
      sub: leadId,
      role: 'T3_EXECUTIVE',
      name: 'Lead User',
    };

    const result = await timesheetService.updateStatus(tsId, 'approved', requester);
    assert.strictEqual(result.status, 'approved');
    assert.strictEqual(saved, true);
  });
});
