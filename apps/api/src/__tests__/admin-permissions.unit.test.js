const test = require('node:test');
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const assert = require('node:assert');
const { requireAdminPermission } = require('../modules/auth/auth.middleware');

test('Admin permissions gate - requireAdminPermission', async (t) => {
  let status = null;
  let body = null;
  let nextCalled = false;

  const res = {
    status: (s) => { status = s; return { json: (b) => { body = b; } }; }
  };
  const next = () => { nextCalled = true; };

  const middleware = requireAdminPermission('users:create');

  // 1. Passes non-admin through
  await t.test('passes non-admin through', async () => {
    nextCalled = false;
    await middleware({ user: { role: 'T1_VOLUNTEER' } }, res, next);
    assert.equal(nextCalled, true);
  });

  // 2. Admin with NO custom grants falls back to defaults
  await t.test('admin with no customGrants falls back to defaults', async () => {
    nextCalled = false;
    // users:create IS in default Admin permissions
    await middleware({ user: { role: 'ADMIN' } }, res, next);
    assert.equal(nextCalled, true);
  });

  // 3. Admin with empty customGrants is ALLOWED because defaults are merged
  await t.test('admin with empty customGrants is allowed due to default merge', async () => {
    nextCalled = false;
    status = null;
    await middleware({ user: { role: 'ADMIN', customGrants: [] } }, res, next);
    assert.equal(nextCalled, true);
  });

  // 4. Admin with specific customGrants is allowed
  await t.test('admin with specific customGrants is allowed', async () => {
    nextCalled = false;
    await middleware({ user: { role: 'ADMIN', customGrants: ['users:create', 'events:read'] } }, res, next);
    assert.equal(nextCalled, true);
  });

  // 5. Admin missing required permission in both defaults and grants is denied
  const invalidMiddleware = requireAdminPermission('super:secret:perm');
  await t.test('admin missing required permission in both defaults and grants is denied', async () => {
    nextCalled = false;
    status = null;
    await invalidMiddleware({ user: { role: 'ADMIN', customGrants: ['events:read'] } }, res, next);
    assert.equal(nextCalled, false);
    assert.equal(status, 403);
    assert.match(body.message, /Missing permission/);
  });

  // 6. Super Admin passes through just like any other non-ADMIN
  await t.test('super admin is checked against permissions', async () => {
    nextCalled = false;
    status = null;
    await middleware({ user: { role: 'SUPER_ADMIN' } }, res, next);
    // Passes through because role != 'ADMIN'
    assert.equal(nextCalled, true);

    nextCalled = false;
    status = null;
    await invalidMiddleware({ user: { role: 'SUPER_ADMIN' } }, res, next);
    // Passes through because role != 'ADMIN'
    assert.equal(nextCalled, true);
  });
});
