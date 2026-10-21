'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── In-memory profile store and stubs ──────────────────────────────────────
const profileStore = new Map();
const userStore = new Map();

const LEAD_ID   = 'aaa000000000000000000001';
const OTHER_T3  = 'aaa000000000000000000002';
const MEMBER_ID = 'bbb000000000000000000001';
const ADMIN_ID  = 'ccc000000000000000000001';

userStore.set(MEMBER_ID, { _id: MEMBER_ID, name: 'Alice Member', role: 'T1_VOLUNTEER' });

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('hr.profile.model')) {
    return {
      findOne({ userId }) {
        const doc = profileStore.get(userId?.toString()) || null;
        return {
          populate() { return this; },
          lean() { return Promise.resolve(doc ? { ...doc } : null); },
        };
      },
      findOneAndUpdate({ userId }, update, opts) {
        const idStr = userId?.toString();
        const existing = profileStore.get(idStr) || { userId: idStr };
        const updated = { ...existing, ...(update.$set || {}) };
        profileStore.set(idStr, updated);
        return Promise.resolve(updated);
      },
    };
  }
  const teamsData = [
    { _id: 'team1', leadId: LEAD_ID, members: [MEMBER_ID] },
  ];
  if (request.endsWith('teams.model') || request.includes('teams/teams.model')) {
    return {
      findOne({ leadId, members } = {}) {
        const l = leadId?.toString();
        const m = members?.toString();
        const matched = teamsData.find(
          (t) => (!l || String(t.leadId) === l) && (!m || t.members.map(String).includes(m))
        );
        const res = matched ? { ...matched } : null;
        return {
          lean() { return Promise.resolve(res); },
          then(resolve, reject) { return Promise.resolve(res).then(resolve, reject); },
        };
      },
    };
  }
  if (request.endsWith('admin.model') || request.includes('admin/admin.model')) {
    return {
      findById(id) {
        const u = userStore.get(id?.toString());
        return {
          select() { return Promise.resolve(u || null); },
        };
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Clear cached files
delete require.cache[require.resolve('../modules/hr/hr.permissions')];
delete require.cache[require.resolve('../modules/hr/hr.profile.controller')];
delete require.cache[require.resolve('../modules/hr/hr.profile.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const profileRouter = require('../modules/hr/hr.profile.routes');
Module._load = origLoad;

function runRoute(method, url, { user, body } = {}) {
  currentUser = user || null;
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      originalUrl: `/api/v1/hr${url}`,
      headers: {},
      ip: '127.0.0.1',
      body: body || {},
      query: {},
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
    profileRouter.handle(req, res, (err) => {
      if (err) resolve({ statusCode: err.statusCode || 500, body: { err: err.message } });
      else resolve({ statusCode: statusCode || 404, body: responseBody });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('HR Profiles: Access rules & CRUD through real router', async (t) => {
  // Wait for dynamic ESM import in auth.middleware
  await new Promise(r => setTimeout(r, 400));
  profileStore.clear();

  await t.test('T1 volunteer is denied access (403)', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: MEMBER_ID, role: 'T1_VOLUNTEER' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T2 associate is denied access (403)', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: 't2_user', role: 'T2_ASSOCIATE' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T3 cannot view their own HR profile (403)', async () => {
    const res = await runRoute('GET', `/profiles/${LEAD_ID}`, {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T3 cannot view profile of person in another team (403)', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: OTHER_T3, role: 'T3_EXECUTIVE' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T3 lead of the member can read profile (200, empty default)', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.userId, MEMBER_ID);
    assert.equal(res.body.data.department, null);
  });

  await t.test('ADMIN with default permissions can update profile (200)', async () => {
    const res = await runRoute('PUT', `/profiles/${MEMBER_ID}`, {
      user: { sub: ADMIN_ID, role: 'ADMIN' },
      body: {
        joiningDate: '2026-01-15',
        notes: 'Promoted to lead volunteer',
      },
    });
    assert.equal(res.statusCode, 200, `Failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.joiningDate, '2026-01-15');
    assert.equal(res.body.data.notes, 'Promoted to lead volunteer');
  });

  await t.test('ADMIN with customGrants missing hr:masters_manage is denied update (403)', async () => {
    const res = await runRoute('PUT', `/profiles/${MEMBER_ID}`, {
      user: { sub: ADMIN_ID, role: 'ADMIN', customGrants: ['events:read'] },
      body: { notes: 'Attempted change' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T3 lead of member is denied update on profile (403 restricted to ADMIN/SUPER_ADMIN)', async () => {
    const res = await runRoute('PUT', `/profiles/${MEMBER_ID}`, {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
      body: { notes: 'T3 attempting update' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Joi validation rejects unknown keys (400)', async () => {
    const res = await runRoute('PUT', `/profiles/${MEMBER_ID}`, {
      user: { sub: ADMIN_ID, role: 'ADMIN' },
      body: { salary: 50000, notes: 'Invalid key' },
    });
    assert.equal(res.statusCode, 400);
  });

  await t.test('SUPER_ADMIN can read updated profile (200)', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: 'sadmin', role: 'SUPER_ADMIN' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.joiningDate, '2026-01-15');
  });

  await t.test('Read gating: ADMIN lacking hr:masters_manage is denied 403 on GET /profiles/:userId', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: 'admin_res', role: 'ADMIN', customGrants: ['events:read'] },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Read gating: ADMIN with defaults can read GET /profiles/:userId', async () => {
    const res = await runRoute('GET', `/profiles/${MEMBER_ID}`, {
      user: { sub: 'admin_def', role: 'ADMIN' },
    });
    assert.equal(res.statusCode, 200);
  });

  // Restore protect
  authMw.protect = origProtect;
});
