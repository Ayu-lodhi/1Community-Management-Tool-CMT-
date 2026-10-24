'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── In-memory store for model stubs ─────────────────────────────────────────
const stores = {};
let seq = 1;
function mkId() { return String(seq++).padStart(24, '0'); }

function makeModelStub(storeKey) {
  stores[storeKey] = stores[storeKey] || [];
  return {
    create(data) {
      if (stores[storeKey].some(d => d.name === data.name && d.isActive !== false)) {
        const e = new Error('dup'); e.code = 11000; return Promise.reject(e);
      }
      const doc = { _id: mkId(), isActive: true, createdAt: new Date(), updatedAt: new Date(), ...data };
      stores[storeKey].push(doc);
      return Promise.resolve(doc);
    },
    find(filter) {
      return {
        sort() {
          return {
            lean() {
              let rows = stores[storeKey] || [];
              if (filter && filter.isActive !== undefined) rows = rows.filter(r => r.isActive === filter.isActive);
              return Promise.resolve(rows);
            },
          };
        },
      };
    },
    findByIdAndUpdate(id, upd, opts) {
      const idx = (stores[storeKey] || []).findIndex(d => d._id === id);
      if (idx < 0) return Promise.resolve(null);
      const patch = upd.$set !== undefined ? upd.$set : upd;
      Object.assign(stores[storeKey][idx], patch, { updatedAt: new Date() });
      return Promise.resolve(opts && opts.new ? stores[storeKey][idx] : stores[storeKey][idx]);
    },
  };
}

const modelStubs = {
  Department:        makeModelStub('departments'),
  Post:              makeModelStub('posts'),
  EmployeeCategory:  makeModelStub('employee-categories'),
  PerformanceFactor: makeModelStub('performance-factors'),
};

// Intercept hr.masters.model before controller or router load
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('hr.masters.model')) {
    return modelStubs;
  }
  return origLoad.apply(this, arguments);
};

// Clear cached files
delete require.cache[require.resolve('../modules/hr/hr.masters.controller')];
delete require.cache[require.resolve('../modules/hr/hr.masters.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const hrMastersRouter = require('../modules/hr/hr.masters.routes');
Module._load = origLoad;

// Helper to run requests through the real Express router
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
    hrMastersRouter.handle(req, res, (err) => {
      if (err) resolve({ statusCode: err.statusCode || 500, body: { err: err.message } });
      else resolve({ statusCode: statusCode || 404, body: responseBody });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('HR Masters: Access rules & CRUD through real router', async (t) => {
  // Wait for dynamic permissions import in auth.middleware
  await new Promise(r => setTimeout(r, 400));

  const TYPES = ['departments', 'posts', 'employee-categories', 'performance-factors'];

  for (const type of TYPES) {
    stores[type] = []; // Reset per type

    const validBody = type === 'performance-factors'
      ? { name: 'Punctuality', benchmarkScore: 10, weight: 2, description: 'On-time arrival' }
      : { name: `Dept ${type}`, description: `Description for ${type}` };

    await t.test(`${type}: T1 is rejected (403)`, async () => {
      const res = await runRoute('GET', `/masters/${type}`, {
        user: { sub: 'u1', role: 'T1_VOLUNTEER' },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test(`${type}: T2 is rejected (403)`, async () => {
      const res = await runRoute('GET', `/masters/${type}`, {
        user: { sub: 'u2', role: 'T2_ASSOCIATE' },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test(`${type}: T3 can read active masters (200)`, async () => {
      const res = await runRoute('GET', `/masters/${type}`, {
        user: { sub: 'u3', role: 'T3_EXECUTIVE' },
      });
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.data));
    });

    await t.test(`${type}: T3 cannot write (403)`, async () => {
      const res = await runRoute('POST', `/masters/${type}`, {
        user: { sub: 'u3', role: 'T3_EXECUTIVE' },
        body: validBody,
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test(`${type}: ADMIN with default permissions can create (201)`, async () => {
      const res = await runRoute('POST', `/masters/${type}`, {
        user: { sub: 'admin1', role: 'ADMIN' },
        body: validBody,
      });
      assert.equal(res.statusCode, 201, `Failed to create: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.data._id);
      assert.equal(res.body.data.name, validBody.name);
    });

    await t.test(`${type}: duplicate name rejected (409)`, async () => {
      const res = await runRoute('POST', `/masters/${type}`, {
        user: { sub: 'admin1', role: 'ADMIN' },
        body: validBody,
      });
      assert.equal(res.statusCode, 409);
    });

    await t.test(`${type}: ADMIN with customGrants lacking hr:masters_manage is denied (403)`, async () => {
      const res = await runRoute('POST', `/masters/${type}`, {
        user: { sub: 'admin1', role: 'ADMIN', customGrants: ['events:read'] },
        body: { ...validBody, name: `Restricted ${type}` },
      });
      assert.equal(res.statusCode, 403);
    });

    await t.test(`${type}: SUPER_ADMIN can create (201)`, async () => {
      const res = await runRoute('POST', `/masters/${type}`, {
        user: { sub: 'sadmin', role: 'SUPER_ADMIN' },
        body: { ...validBody, name: `SuperAdmin ${type}` },
      });
      assert.equal(res.statusCode, 201);
    });

    await t.test(`${type}: ADMIN can update (200)`, async () => {
      const id = stores[type][0]._id;
      const res = await runRoute('PATCH', `/masters/${type}/${id}`, {
        user: { sub: 'admin1', role: 'ADMIN' },
        body: { description: 'Updated description' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.description, 'Updated description');
    });

    await t.test(`${type}: ADMIN can soft-delete (200)`, async () => {
      const id = stores[type][0]._id;
      const res = await runRoute('DELETE', `/masters/${type}/${id}`, {
        user: { sub: 'admin1', role: 'ADMIN' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.isActive, false);
    });

    if (type === 'performance-factors') {
      await t.test('performance-factor rejects invalid benchmarkScore (400)', async () => {
        const res = await runRoute('POST', `/masters/${type}`, {
          user: { sub: 'admin1', role: 'ADMIN' },
          body: { name: 'Bad Factor', benchmarkScore: 0, weight: 1 },
        });
        assert.equal(res.statusCode, 400);
      });
    }
  }

  await t.test('Unknown or prototype-like :type values return 400', async () => {
    for (const invalidType of ['__proto__', 'constructor', 'Users', 'payroll', 'invalid_type']) {
      const res = await runRoute('GET', `/masters/${invalidType}`, {
        user: { sub: 'admin1', role: 'ADMIN' },
      });
      assert.equal(res.statusCode, 400, `Expected 400 for type "${invalidType}", got ${res.statusCode}`);
      assert.match(res.body.err, /Unknown master type/);
    }
  });

  // Restore protect
  authMw.protect = origProtect;
});
