const test = require('node:test');
const assert = require('node:assert/strict');

const originalEnv = { ...process.env };
const { ROLE_DEFAULT_PERMISSIONS } = require('@tbi/shared-constants/permissions');

test('Admin granular permissions on real mounted router', { concurrency: 1 }, async (t) => {
  let mockUser = null;

  let authMiddleware;
  let adminController;
  let adminRouter;

  let origProtect;
  let origGetUsers;
  let origAddUser;

  t.before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
    process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
    process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
    process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

    authMiddleware = require('../modules/auth/auth.middleware');
    adminController = require('../modules/admin/admin.controller');

    origProtect = authMiddleware.protect;
    origGetUsers = adminController.getUsers;
    origAddUser = adminController.addUser;

    authMiddleware.protect = (req, res, next) => {
      if (!mockUser) return res.status(401).json({ message: 'No mock user' });
      req.user = mockUser;
      next();
    };

    adminController.getUsers = (req, res) => res.status(200).json({ mock: true });
    adminController.addUser = (req, res) => res.status(201).json({ mock: true });

    // Clear router from cache so it binds to our mocked controller & middleware functions
    delete require.cache[require.resolve('../modules/admin/admin.routes')];
    adminRouter = require('../modules/admin/admin.routes');
  });

  t.after(() => {
    if (authMiddleware) authMiddleware.protect = origProtect;
    if (adminController) {
      adminController.getUsers = origGetUsers;
      adminController.addUser = origAddUser;
    }

    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  const runRoute = (method, url) => {
    return new Promise((resolve) => {
      const req = { method, url, headers: {}, ip: '127.0.0.1' };
      const res = {
        statusCode: 200,
        body: null,
        on(event, cb) {
           if (event === 'finish') {
             setTimeout(cb, 0);
           }
        },
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; resolve(this); return this; },
      };
      adminRouter.handle(req, res, (err) => {
        if(err) resolve({ statusCode: 500, body: err.message });
        else resolve({ statusCode: res.statusCode || 404, body: res.body });
      });
    });
  };

  await t.test('Admin with no customGrants gets all defaults', async () => {
    mockUser = { _id: '123', sub: '123', role: 'ADMIN', customGrants: undefined };

    const resRead = await runRoute('GET', '/users');
    assert.notEqual(resRead.statusCode, 403, 'Should not be 403 for users:read');

    const resCreate = await runRoute('POST', '/users');
    assert.notEqual(resCreate.statusCode, 403, 'Should not be 403 for users:create');
  });

  await t.test('Admin with customGrants lacking users:create gets 403 on POST /admin/users', async () => {
    const exactGrants = ROLE_DEFAULT_PERMISSIONS['ADMIN'].filter(p => p !== 'users:create');
    mockUser = { _id: '123', sub: '123', role: 'ADMIN', customGrants: exactGrants };

    const resRead = await runRoute('GET', '/users');
    assert.notEqual(resRead.statusCode, 403, 'users:read should be allowed');

    const resCreate = await runRoute('POST', '/users');
    assert.equal(resCreate.statusCode, 403, 'Expected 403 because users:create is not in customGrants (union bug)');
  });
});