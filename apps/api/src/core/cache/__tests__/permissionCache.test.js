const test = require('node:test');
const assert = require('node:assert/strict');
const { getCachedPermissions, setCachedPermissions, invalidateUserPermissions } = require('../permissionCache');

test('permissionCache: graceful fallback when Redis is offline', async () => {
  const userId = '507f1f77bcf86cd799439011';
  // With no redis connection ready, getCachedPermissions must return null (fail closed/safe)
  const cached = await getCachedPermissions(userId);
  assert.equal(cached, null);

  // setCachedPermissions must not throw
  await assert.doesNotReject(async () => {
    await setCachedPermissions(userId, ['events:read', 'events:create']);
  });

  // invalidateUserPermissions must not throw
  await assert.doesNotReject(async () => {
    await invalidateUserPermissions(userId);
  });
});
