const test = require('node:test');
const assert = require('node:assert/strict');

const originalEnv = { ...process.env };
const { ROLE_DEFAULT_PERMISSIONS, PERMISSIONS } = require('@tbi/shared-constants/permissions');

test('HR Router E2E & Middleware Stack Verification (Phase 3 Integration)', { concurrency: 1 }, async (t) => {
  let mockUser = null;
  let authMiddleware;
  let hrController;
  let hrRouter;

  let origProtect;
  let origCreateFactor;
  let origSubmitReview;
  let origCreateIncident;
  let origListFactors;
  let origGetPolicy;
  let origExportReviews;

  t.before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

    authMiddleware = require('../modules/auth/auth.middleware');
    hrController = require('../modules/hr/hr.controller');

    origProtect = authMiddleware.protect;
    origCreateFactor = hrController.createFactor;
    origSubmitReview = hrController.submitReview;
    origCreateIncident = hrController.createIncident;
    origListFactors = hrController.listFactors;
    origGetPolicy = hrController.getPolicy;
    origExportReviews = hrController.exportReviews;

    authMiddleware.protect = (req, res, next) => {
      if (!mockUser) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      req.user = mockUser;
      next();
    };

    hrController.createFactor = (req, res) => res.status(201).json({ mock: true });
    hrController.submitReview = (req, res) => res.status(201).json({ mock: true });
    hrController.createIncident = (req, res) => res.status(201).json({ mock: true });
    hrController.listFactors = (req, res) => res.status(200).json({ mock: true });
    hrController.getPolicy = (req, res) => res.status(200).json({ mock: true });
    hrController.exportReviews = (req, res) => res.status(200).send('mock,csv');

    delete require.cache[require.resolve('../modules/hr/hr.routes')];
    hrRouter = require('../modules/hr/hr.routes');
  });

  t.after(() => {
    if (authMiddleware) authMiddleware.protect = origProtect;
    if (hrController) {
      hrController.createFactor = origCreateFactor;
      hrController.submitReview = origSubmitReview;
      hrController.createIncident = origCreateIncident;
      hrController.listFactors = origListFactors;
      hrController.getPolicy = origGetPolicy;
      hrController.exportReviews = origExportReviews;
    }

    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  const runRoute = (method, url, body = {}) => {
    return new Promise((resolve) => {
      const req = { method, url, body, headers: {}, ip: '127.0.0.1' };
      const res = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          resolve(this);
          return this;
        },
        send(data) {
          this.body = data;
          resolve(this);
          return this;
        },
      };

      hrRouter.handle(req, res, (err) => {
        if (err) resolve({ statusCode: 500, body: err.message });
        else resolve({ statusCode: res.statusCode || 404, body: res.body });
      });
    });
  };

  await t.test('1. Unauthenticated request: returns 401 across routes', async () => {
    mockUser = null;
    const res = await runRoute('GET', '/factors');
    assert.equal(res.statusCode, 401);
  });

  await t.test('2. Masters POST /factors: non-admin is blocked with 403', async () => {
    mockUser = { _id: '123', sub: '123', role: 'T3_EXECUTIVE' };
    const res = await runRoute('POST', '/factors');
    assert.equal(res.statusCode, 403);
    assert.ok(res.body.message.includes('Allowed roles: ADMIN, SUPER_ADMIN'));
  });

  await t.test('3. Masters POST /factors: Admin lacking hr:masters_manage is denied', async () => {
    // Admin with customGrants that omit hr:masters_manage
    const customGrants = ['users:read', 'events:read'];
    mockUser = { _id: '123', sub: '123', role: 'ADMIN', customGrants };

    const res = await runRoute('POST', '/factors');
    assert.equal(res.statusCode, 403);
    assert.ok(res.body.message.includes('Missing permission: hr:masters_manage'));
  });

  await t.test('4. Masters POST /factors: Admin with default grants succeeds', async () => {
    mockUser = { _id: '123', sub: '123', role: 'ADMIN', customGrants: undefined };
    const res = await runRoute('POST', '/factors');
    assert.equal(res.statusCode, 201);
  });

  await t.test('5. POST /reviews: T1 Volunteer is blocked with 403', async () => {
    mockUser = { _id: '123', sub: '123', role: 'T1_VOLUNTEER' };
    const res = await runRoute('POST', '/reviews');
    assert.equal(res.statusCode, 403);
  });

  await t.test('6. POST /reviews: T3 Executive is permitted to submit reviews', async () => {
    mockUser = { _id: '123', sub: '123', role: 'T3_EXECUTIVE' };
    const res = await runRoute('POST', '/reviews');
    assert.equal(res.statusCode, 201);
  });

  await t.test('7. POST /incidents: T1 Volunteer is blocked; T3 Executive is permitted', async () => {
    mockUser = { _id: '123', sub: '123', role: 'T1_VOLUNTEER' };
    const resDenied = await runRoute('POST', '/incidents');
    assert.equal(resDenied.statusCode, 403);

    mockUser = { _id: '123', sub: '123', role: 'T3_EXECUTIVE' };
    const resAllowed = await runRoute('POST', '/incidents');
    assert.equal(resAllowed.statusCode, 201);
  });

  await t.test('8. GET /factors and GET /attendance-policy: all authenticated roles permitted', async () => {
    mockUser = { _id: '123', sub: '123', role: 'T1_VOLUNTEER' };
    const resFactors = await runRoute('GET', '/factors');
    assert.equal(resFactors.statusCode, 200);

    const resPolicy = await runRoute('GET', '/attendance-policy');
    assert.equal(resPolicy.statusCode, 200);
  });

  await t.test('9. GET /export/reviews/:teamId: restricted to T3 and Admin', async () => {
    mockUser = { _id: '123', sub: '123', role: 'T1_VOLUNTEER' };
    const resDenied = await runRoute('GET', '/export/reviews/team123');
    assert.equal(resDenied.statusCode, 403);

    mockUser = { _id: '123', sub: '123', role: 'T3_EXECUTIVE' };
    const resAllowed = await runRoute('GET', '/export/reviews/team123');
    assert.equal(resAllowed.statusCode, 200);
  });
});
