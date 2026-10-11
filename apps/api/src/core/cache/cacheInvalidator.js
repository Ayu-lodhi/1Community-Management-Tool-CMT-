import { redisCache } from '../config/redis-cache.client.js';
import { logger } from '../utils/logger.js';

/**
 * cacheInvalidator.js — Explicit Write-Path Cache Invalidation
 *
 * MUST be invoked on all write operations touching cached entities.
 * Never rely on passive TTL expiration alone.
 */
export async function invalidateCacheKeys(keys) {
  if (!keys || (Array.isArray(keys) && keys.length === 0)) return;

  const keyList = Array.isArray(keys) ? keys : [keys];
  try {
    await redisCache.del(...keyList);
    logger.debug(`Explicitly invalidated cache keys: ${keyList.join(', ')}`);
  } catch (err) {
    logger.error('Cache invalidation error', { keys: keyList, error: err.message });
  }
}

export async function invalidatePattern(pattern) {
  try {
    const keys = await redisCache.keys(pattern);
    if (keys.length > 0) {
      await redisCache.del(...keys);
      logger.debug(`Invalidated pattern ${pattern} (${keys.length} keys)`);
    }
  } catch (err) {
    logger.error('Pattern cache invalidation error', { pattern, error: err.message });
  }
}
