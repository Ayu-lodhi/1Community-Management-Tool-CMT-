import { redisCache } from '../config/redis-cache.client.js';
import { logger } from '../utils/logger.js';

/**
 * sessionTerminator.js — Unified Session Termination Utility
 *
 * Used by both Admin "Deactivate" and Super Admin "Revoke" to immediately
 * invalidate active user sessions, blacklisting active tokens and deleting cached sessions.
 */
export async function terminateUserSessions(userId, reason = 'Administrative action') {
  if (!userId) {
    throw new Error('UserId is required for session termination');
  }

  try {
    const timestamp = Date.now();
    // 1. Mark user session invalidated in Redis cache with 7 days TTL (matching refresh token lifecycle)
    await redisCache.set(`revoked_user:${userId}`, JSON.stringify({ revokedAt: timestamp, reason }), 'EX', 7 * 24 * 60 * 60);

    // 2. Delete active session data key if any
    await redisCache.del(`session:${userId}`);

    logger.info(`Terminated all active sessions for user ${userId}. Reason: ${reason}`);
    return { success: true, userId, terminatedAt: timestamp };
  } catch (error) {
    logger.error(`Failed to terminate sessions for user ${userId}`, { error: error.message });
    throw error;
  }
}
