let redisCache;
let logger;
try {
  redisCache = require('../config/redis-cache.client').redisCache;
  logger = require('../utils/logger').logger;
} catch (_) {
  redisCache = { del: async () => {}, keys: async () => [] };
  logger = { debug: () => {}, error: () => {} };
}

/**
 * cacheInvalidator.js — Explicit Write-Path Cache Invalidation
 *
 * MUST be invoked on all write operations touching cached entities.
 * Never rely on passive TTL expiration alone.
 */
async function invalidateCacheKeys(keys) {
  if (!keys || (Array.isArray(keys) && keys.length === 0)) return;

  const keyList = Array.isArray(keys) ? keys : [keys];
  try {
    if (redisCache && typeof redisCache.del === 'function') {
      await redisCache.del(...keyList);
    }
    if (logger && typeof logger.debug === 'function') {
      logger.debug(`Explicitly invalidated cache keys: ${keyList.join(', ')}`);
    }
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Cache invalidation error', { keys: keyList, error: err.message });
    }
  }
}

async function invalidatePattern(pattern) {
  try {
    if (redisCache && typeof redisCache.keys === 'function' && typeof redisCache.del === 'function') {
      const keys = await redisCache.keys(pattern);
      if (keys.length > 0) {
        await redisCache.del(...keys);
        if (logger && typeof logger.debug === 'function') {
          logger.debug(`Invalidated pattern ${pattern} (${keys.length} keys)`);
        }
      }
    }
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Pattern cache invalidation error', { pattern, error: err.message });
    }
  }
}

module.exports = {
  invalidateCacheKeys,
  invalidatePattern,
};
