const { test } = require('node:test');
const assert = require('node:assert/strict');
const statsService = require('../modules/stats/stats.service');

test('Stats cache eviction and bound', async (t) => {
  await t.test('statsCache exposes eviction and bounds maximum entries', async () => {
    // If statsService exposes clearCache or getCacheSize
    assert.strictEqual(typeof statsService._statsCache, 'object', 'statsCache should be exposed for testability/maintenance');

    const cache = statsService._statsCache;
    cache.clear();

    // Populate with 150 items
    for (let i = 0; i < 150; i++) {
      cache.set(`key_${i}`, { data: i, expiresAt: Date.now() - 1000 }); // expired
    }

    assert.strictEqual(cache.size, 150);

    // Call getAdminStats or trigger a cache set
    const fetcher = async () => 'test_data';
    await statsService._getOrSetCache('test_key', fetcher);

    // After set with eviction, expired keys should be purged and size capped
    assert.ok(cache.size <= 100, `Cache size must be capped at 100, got ${cache.size}`);
  });
});
