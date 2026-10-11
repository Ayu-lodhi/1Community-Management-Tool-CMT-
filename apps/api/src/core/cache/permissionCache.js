// ====================================================================
// Permission Cache — Redis-backed permission cache with instant invalidation
// ====================================================================

const { redisCache } = require('../config/redis-cache.client');
const { logger } = require('../utils/logger');

const PERM_TTL_SECONDS = 300; // 5 minutes

/**
 * Retrieve cached resolved permissions for a user
 * @param {string} userId
 * @returns {Promise<string[]|null>}
 */
async function getCachedPermissions(userId) {
  if (!userId || !redisCache || redisCache.status !== 'ready') {
    return null;
  }
  try {
    const raw = await redisCache.get(`perm:${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn('Failed to read permissions from Redis cache', { userId, error: err.message });
    return null;
  }
}

/**
 * Store resolved permissions for a user with short TTL
 * @param {string} userId
 * @param {string[]|Set<string>} permissions
 * @param {number} ttl
 */
async function setCachedPermissions(userId, permissions, ttl = PERM_TTL_SECONDS) {
  if (!userId || !redisCache || redisCache.status !== 'ready') {
    return;
  }
  try {
    const list = Array.isArray(permissions) ? permissions : Array.from(permissions);
    await redisCache.set(`perm:${userId}`, JSON.stringify(list), 'EX', ttl);
  } catch (err) {
    logger.warn('Failed to write permissions to Redis cache', { userId, error: err.message });
  }
}

/**
 * Invalidate user permissions immediately
 * Must be invoked whenever roles or ACCESS_GRANT change, on logout, or session termination
 * @param {string} userId
 */
async function invalidateUserPermissions(userId) {
  if (!userId || !redisCache || redisCache.status !== 'ready') {
    return;
  }
  try {
    await redisCache.del(`perm:${userId}`);
    logger.info(`Invalidated permission cache for user ${userId}`);
  } catch (err) {
    logger.warn('Failed to delete permission cache from Redis', { userId, error: err.message });
  }
}

module.exports = {
  getCachedPermissions,
  setCachedPermissions,
  invalidateUserPermissions,
};
