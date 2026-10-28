const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const { requireTeamLeadOrAdmin } = require('../modules/workforce/workforce.middleware');
const Team = require('../modules/teams/teams.model');

test('Workforce Multi-Team Middleware Resolution', async (t) => {
  const origFindOne = Team.findOne;

  t.afterEach(() => {
    Team.findOne = origFindOne;
  });

  await t.test('preserves explicit req.body.teamId if caller leads that team', async () => {
    const callerId = new mongoose.Types.ObjectId().toString();
    const teamBId = new mongoose.Types.ObjectId().toString();

    Team.findOne = async (filter) => {
      if (filter._id?.toString() === teamBId && filter.leadId === callerId) {
        return { _id: teamBId, leadId: callerId };
      }
      return null;
    };

    const req = {
      method: 'POST',
      path: '/tasks',
      user: { sub: callerId, role: 'T3_EXECUTIVE' },
      body: { teamId: teamBId, title: 'Task for Team B' },
    };

    let nextCalled = false;
    const res = {};
    const next = () => { nextCalled = true; };

    await requireTeamLeadOrAdmin(req, res, next);
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.body.teamId.toString(), teamBId.toString());
  });

  await t.test('rejects explicit req.body.teamId if caller does not lead that team', async () => {
    const callerId = new mongoose.Types.ObjectId().toString();
    const otherTeamId = new mongoose.Types.ObjectId().toString();

    Team.findOne = async (filter) => {
      // Caller leads Team A, but request is for otherTeamId
      if (filter._id?.toString() === otherTeamId) {
        return null; // not lead of otherTeamId
      }
      return { _id: new mongoose.Types.ObjectId(), leadId: callerId };
    };

    const req = {
      method: 'POST',
      path: '/tasks',
      user: { sub: callerId, role: 'T3_EXECUTIVE' },
      body: { teamId: otherTeamId, title: 'Task for another team' },
    };

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await requireTeamLeadOrAdmin(req, res, next);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.match(responseData.message, /not.*lead.*team/i);
  });
});
