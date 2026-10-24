'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── 1. HR permission constants visible through requireAdminPermission ─────

test('HR permission constants: ADMIN defaults and T3 exclusion', async (t) => {
  const { requireAdminPermission } = require('../modules/auth/auth.middleware');

  // Wait for the dynamic ESM import inside auth.middleware to settle
  await new Promise((r) => setTimeout(r, 400));

  const makeRes = () => {
    let status = null, body = null;
    return {
      _status: () => status,
      _body:   () => body,
      status: (s) => { status = s; return { json: (b) => { body = b; } }; },
    };
  };

  const HR_PERMS = [
    'hr:masters_manage',
    'hr:incidents_manage',
    'hr:reviews_manage',
    'hr:export',
  ];

  for (const perm of HR_PERMS) {
    const mw = requireAdminPermission(perm);

    await t.test(`ADMIN default includes ${perm}`, async () => {
      let nextCalled = false;
      const res = makeRes();
      await mw({ user: { role: 'ADMIN' } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true, `ADMIN should pass for ${perm} via defaults`);
    });

    await t.test(`ADMIN with customGrants=[${perm}] passes`, async () => {
      let nextCalled = false;
      const res = makeRes();
      await mw({ user: { role: 'ADMIN', customGrants: [perm] } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    });

    await t.test(`ADMIN with customGrants=[] (not including ${perm}) is denied`, async () => {
      let nextCalled = false;
      const res = makeRes();
      await mw({ user: { role: 'ADMIN', customGrants: ['events:read'] } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, false, `ADMIN missing ${perm} in customGrants should be denied`);
      assert.equal(res._status(), 403);
    });

    await t.test(`SUPER_ADMIN passes through for ${perm}`, async () => {
      let nextCalled = false;
      const res = makeRes();
      await mw({ user: { role: 'SUPER_ADMIN' } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    });

    await t.test(`T3_EXECUTIVE is not checked (passes next) for ${perm}`, async () => {
      // requireAdminPermission only gates ADMIN; T3 falls through — HR route guards handle T3 separately
      let nextCalled = false;
      const res = makeRes();
      await mw({ user: { role: 'T3_EXECUTIVE' } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    });
  }
});

// ── 2. T3 lead-of-person check (pure logic, Team model mocked) ────────────

test('T3 lead-of-person check: isLeadOfPerson and getLedMemberIds', async (t) => {
  const LEAD_ID  = 'aaa000000000000000000001';
  const OTHER_ID = 'aaa000000000000000000002';
  const MEMBER_A = 'bbb000000000000000000001';
  const MEMBER_B = 'bbb000000000000000000002';

  // Stub Team model before requiring hr.permissions
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (
      request.endsWith('teams.model') ||
      request.endsWith('teams.model.js') ||
      (request.includes('teams') && request.includes('model'))
    ) {
      const teamsData = [
        { _id: 'teamA', leadId: LEAD_ID, members: [MEMBER_A] },
        { _id: 'teamB', leadId: LEAD_ID, members: [MEMBER_B] },
      ];
      return {
        findOne({ leadId, members } = {}) {
          const l = leadId?.toString();
          const m = members?.toString();
          const matched = teamsData.find(
            (t) => (!l || String(t.leadId) === l) && (!m || t.members.map(String).includes(m))
          );
          return { lean: () => matched ? { ...matched } : null };
        },
        find({ leadId } = {}) {
          const l = leadId?.toString();
          const matched = teamsData.filter((t) => !l || String(t.leadId) === l);
          return { select: () => ({ lean: () => matched }) };
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };

  const hrPermPath = require.resolve('../modules/hr/hr.permissions');
  delete require.cache[hrPermPath];
  const { isLeadOfPerson, getLedMemberIds } = require('../modules/hr/hr.permissions');
  Module._load = originalLoad;

  await t.test('lead of MEMBER_A is authorized', async () => {
    assert.equal(await isLeadOfPerson(LEAD_ID, MEMBER_A), true);
  });

  await t.test('lead of MEMBER_B is authorized (multi-team scenario)', async () => {
    assert.equal(await isLeadOfPerson(LEAD_ID, MEMBER_B), true);
  });

  await t.test('other user is NOT authorized for MEMBER_A', async () => {
    assert.equal(await isLeadOfPerson(OTHER_ID, MEMBER_A), false);
  });

  await t.test('self-report denied: lead cannot target themselves', async () => {
    // LEAD_ID is not in members array so findOne returns null
    assert.equal(await isLeadOfPerson(LEAD_ID, LEAD_ID), false);
  });

  await t.test('getLedMemberIds returns union of all led team members', async () => {
    const ids = await getLedMemberIds(LEAD_ID);
    assert.ok(ids.has(MEMBER_A), 'MEMBER_A in union');
    assert.ok(ids.has(MEMBER_B), 'MEMBER_B in union');
    assert.ok(!ids.has(LEAD_ID), 'lead not included in their own member set');
  });

  await t.test('getLedMemberIds returns empty set when user leads no teams', async () => {
    const ids = await getLedMemberIds(OTHER_ID);
    assert.equal(ids.size, 0);
  });
});
